import {decode} from "cborg"
import {downcast} from "@tutao/tutanota-utils"
import type {U2fRegisteredDevice} from "../../../api/entities/sys/U2fRegisteredDevice"
import {createU2fRegisteredDevice} from "../../../api/entities/sys/U2fRegisteredDevice"
import type {U2fChallenge} from "../../../api/entities/sys/U2fChallenge"
import type {WebauthnResponseData} from "../../../api/entities/sys/WebauthnResponseData"
import {createWebauthnResponseData} from "../../../api/entities/sys/WebauthnResponseData"
import {TutanotaError} from "../../../api/common/error/TutanotaError"
import type {IWebauthn} from "./IWebauthn.js"
import {getWebRoot} from "../../../api/common/Env.js"

/** Web authentication entry point for the rest of the app. */
export interface IWebauthnClient {
	isSupported(): boolean;

	/** Whether it's possible to attempt a challenge. It might not be possible if there are not keys for this domain. */
	canAttemptChallenge(challenge: U2fChallenge): boolean;

	register(userId: Id, name: string, mailAddress: string, signal: AbortSignal): Promise<U2fRegisteredDevice>;

	authenticate(challenge: U2fChallenge, signal?: AbortSignal): Promise<WebauthnResponseData>;
}

export class WebauthnClient implements IWebauthnClient {
	private readonly domain: string

	constructor(
		private readonly webauthn: IWebauthn
	) {
		this.domain = getWebRoot()
	}

	isSupported(): boolean {
		return this.webauthn.isSupported()
	}

	canAttemptChallenge(challenge: U2fChallenge): boolean {
		return challenge.keys.some(key => this.webauthn.canAttemptChallengeForRpId(key.appId) || this.webauthn.canAttemptChallengeForU2FAppId(key.appId))
	}

	async register(userId: Id, displayName: string, mailAddress: string, signal: AbortSignal): Promise<U2fRegisteredDevice> {
		const challenge = this.getChallenge()
		const name = `${userId} ${mailAddress} ${displayName}`
		const registrationResult = await this.webauthn.register({challenge, userId, name, displayName, domain: this.domain})
		const attestationObject = this.parseAttestationObject(registrationResult.attestationObject)
		const publicKey = this.parsePublicKey(downcast(attestationObject).authData)

		return createU2fRegisteredDevice({
			keyHandle: new Uint8Array(registrationResult.rawId),
			// For Webauthn keys we save rpId into appId. They do not conflict: one of them is json URL, another is domain.
			appId: registrationResult.rpId,
			publicKey: this.serializePublicKey(publicKey),
			compromised: false,
			counter: "-1",
		})
	}

	async authenticate(challenge: U2fChallenge, signal?: AbortSignal): Promise<WebauthnResponseData> {
		const allowedKeys: Array<PublicKeyCredentialDescriptor> = challenge.keys.map(key => {
			return {
				id: key.keyHandle,
				type: "public-key",
			}
		})
		const signResult = await this.webauthn.sign({
			challenge: challenge.challenge,
			keys: allowedKeys,
			domain: this.domain
		})

		return createWebauthnResponseData({
			keyHandle: new Uint8Array(signResult.rawId),
			clientData: new Uint8Array(signResult.clientDataJSON),
			signature: new Uint8Array(signResult.signature),
			authenticatorData: new Uint8Array(signResult.authenticatorData),
		})
	}

	private getChallenge(): Uint8Array {
		// Should be replaced with our own entropy generator in the future.
		const random = new Uint8Array(32)
		crypto.getRandomValues(random)
		return random
	}

	private parseAttestationObject(raw: ArrayBuffer): unknown {
		return decode(new Uint8Array(raw))
	}

	private parsePublicKey(authData: Uint8Array): Map<number, number | Uint8Array> {
		// get the length of the credential ID
		const dataView = new DataView(new ArrayBuffer(2))
		const idLenBytes = authData.slice(53, 55)
		idLenBytes.forEach((value, index) => dataView.setUint8(index, value))
		const credentialIdLength = dataView.getUint16(0)
		// get the public key object
		const publicKeyBytes = authData.slice(55 + credentialIdLength)
		// the publicKeyBytes are encoded again as CBOR
		// We have to use maps here because keys are numeric and cborg only allows them in maps
		return decode(new Uint8Array(publicKeyBytes.buffer), {
			useMaps: true,
		})
	}

	private serializePublicKey(publicKey: Map<number, number | Uint8Array>): Uint8Array {
		const encoded = new Uint8Array(65)
		encoded[0] = 0x04
		const x = publicKey.get(-2)
		const y = publicKey.get(-3)

		if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
			throw new Error("Public key is in unknown format")
		}

		encoded.set(x, 1)
		encoded.set(y, 33)
		return encoded
	}
}

export class WebauthnError extends TutanotaError {
	constructor(error: Error) {
		super("WebauthnUnrecoverableError", `${error.name} ${String(error)}`)
	}
}

export class WebauthnCancelledError extends TutanotaError {
	constructor(error: Error) {
		super("WebauthnCancelledError", `${error.name} ${String(error)}`)
	}
}