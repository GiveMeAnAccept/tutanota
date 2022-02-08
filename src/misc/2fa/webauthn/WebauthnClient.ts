import {decode} from "cborg"
import {downcast, stringToUtf8Uint8Array} from "@tutao/tutanota-utils"
import {getHttpOrigin} from "../../../api/common/Env"
import type {U2fRegisteredDevice} from "../../../api/entities/sys/U2fRegisteredDevice"
import {createU2fRegisteredDevice} from "../../../api/entities/sys/U2fRegisteredDevice"
import type {U2fChallenge} from "../../../api/entities/sys/U2fChallenge"
import type {WebauthnResponseData} from "../../../api/entities/sys/WebauthnResponseData"
import {createWebauthnResponseData} from "../../../api/entities/sys/WebauthnResponseData"
import {TutanotaError} from "../../../api/common/error/TutanotaError"
import type {
	AuthenticatorAssertionResponse,
	AuthenticatorAttestationResponse,
	CredentialsApi,
	PublicKeyCredential,
	PublicKeyCredentialCreationOptions,
	PublicKeyCredentialRequestOptions,
} from "./WebauthnTypes"
import {COSEAlgorithmIdentifierNames, PublicKeyCredentialDescriptor} from "./WebauthnTypes"
import {ProgrammingError} from "../../../api/common/error/ProgrammingError"

const WEBAUTHN_TIMEOUT_MS = 60000

interface IWebauthnClient {
	isSupported(): boolean;

	/** Whether it's possible to attempt a challenge. It might not be possible if there are not keys for this domain. */
	canAttemptChallenge(challenge: U2fChallenge): boolean;

	register(userId: Id, name: string, mailAddress: string, signal: AbortSignal): Promise<U2fRegisteredDevice>;

	authenticate(challenge: U2fChallenge, signal?: AbortSignal): Promise<WebauthnResponseData>;
}

interface IWebauthn {
	isSupported(): boolean;

	canAttemptChallengeForRpId(rpId: string): boolean;

	canAttemptChallengeForU2FAppId(appId: string): boolean;

	register(challenge: Uint8Array, id: string, name: string, displayName: string): Promise<{credential: PublicKeyCredential, rpId: string}>;

	sign(challenge: Uint8Array, keys: Array<PublicKeyCredentialDescriptor>): Promise<PublicKeyCredential>;
}

class BrowserWebauthn implements IWebauthn {
	/**
	 * Relying Party Identifier
	 * see https://www.w3.org/TR/webauthn-2/#public-key-credential-source-rpid
	 */
	private readonly rpId: string;
	/** Backward-compatible identifier for the legacy U2F API */
	private readonly appId: string;

	constructor(
		private readonly api: CredentialsApi,
		hostname: string
	) {
		this.rpId = this.rpIdFromHost(hostname)
		this.appId = this.appidFromHost(hostname)
	}

	canAttemptChallengeForRpId(rpId: string): boolean {
		return rpId === this.rpId
	}

	canAttemptChallengeForU2FAppId(appId: string): boolean {
		return this.appId === appId
	}

	isSupported(): boolean {
		return this.api != null &&
			// @ts-ignore see polyfill.js
			// We just stub BigInt in order to import cborg without issues but we can't actually use it
			!BigInt.polyfilled
	}

	async register(challenge: Uint8Array, id: string, name: string, displayName: string): Promise<{credential: PublicKeyCredential, rpId: string}> {
		const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
			challenge,
			rp: {
				name: "Tutanota",
				id: this.rpId,
			},
			user: {
				id: stringToUtf8Uint8Array(id),
				name,
				displayName,
			},
			pubKeyCredParams: [
				{
					alg: COSEAlgorithmIdentifierNames.ES256,
					type: "public-key",
				},
			],
			authenticatorSelection: {
				authenticatorAttachment: "cross-platform",
			},
			timeout: WEBAUTHN_TIMEOUT_MS,
			attestation: "none",
		}
		const credential = await this.api.create({
			publicKey: publicKeyCredentialCreationOptions,
			// TODO
			// signal,
		})
		return {credential: credential as PublicKeyCredential, rpId: this.rpId}
	}

	async sign(challenge: Uint8Array, keys: Array<PublicKeyCredentialDescriptor>): Promise<PublicKeyCredential> {
		const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
			challenge: challenge,
			rpId: this.rpId,
			allowCredentials: keys,
			extensions: {
				appid: this.appId,
			},
			userVerification: "discouraged",
			timeout: WEBAUTHN_TIMEOUT_MS,
		}
		let assertion

		try {
			assertion = await this.api.get({
				publicKey: publicKeyCredentialRequestOptions,
				// TODO
				// signal,
			})
		} catch (e) {
			if (e.name === "AbortError") {
				throw new WebauthnCancelledError(e)
			} else {
				throw new WebauthnError(e)
			}
		}

		const publicKeyCredential = assertion as PublicKeyCredential | null

		if (publicKeyCredential == null) {
			throw new ProgrammingError("Webauthn credential could not be unambiguously resolved")
		}
		return publicKeyCredential
	}

	private rpIdFromHost(hostname: string): string {
		if (hostname.endsWith("tutanota.com")) {
			return "tutanota.com"
		} else {
			return hostname
		}
	}

	private appidFromHost(hostname: string): string {
		if (hostname.endsWith("tutanota.com")) {
			return "https://tutanota.com/u2f-appid.json"
		} else {
			return getHttpOrigin() + "/u2f-appid.json"
		}
	}
}

export class WebauthnClient implements IWebauthnClient {
	constructor(
		private readonly webauthn: IWebauthn
	) {
	}

	isSupported(): boolean {
		return this.webauthn.isSupported()
	}

	canAttemptChallenge(challenge: U2fChallenge): boolean {
		return challenge.keys.some(key => this.webauthn.canAttemptChallengeForRpId(key.appId) || this.webauthn.canAttemptChallengeForU2FAppId(key.appId))
	}

	async register(userId: Id, name: string, mailAddress: string, signal: AbortSignal): Promise<U2fRegisteredDevice> {
		const challenge = this.getChallenge()

		const {credential, rpId} = await this.webauthn.register(challenge, userId, `${userId} ${mailAddress} ${name}`, name)

		const response = credential.response as AuthenticatorAttestationResponse

		const attestationObject = this.parseAttestationObject(response.attestationObject)

		const publicKey = this.parsePublicKey(downcast(attestationObject).authData)

		return createU2fRegisteredDevice({
			keyHandle: new Uint8Array(credential.rawId),
			// For Webauthn keys we save rpId into appId. They do not conflict: one of them is json URL, another is domain.
			appId: rpId,
			publicKey: this.serializePublicKey(publicKey),
			compromised: false,
			counter: "-1",
		})
	}

	async authenticate(challenge: U2fChallenge, signal?: AbortSignal): Promise<WebauthnResponseData> {
		const allowedKeys = challenge.keys.map(key => {
			return {
				id: key.keyHandle,
				type: "public-key",
			}
		})
		const publicKeyCredential = await this.webauthn.sign(challenge.challenge, allowedKeys)

		const response: AuthenticatorAssertionResponse = downcast(publicKeyCredential.response)
		return createWebauthnResponseData({
			keyHandle: new Uint8Array(publicKeyCredential.rawId),
			clientData: new Uint8Array(response.clientDataJSON),
			signature: new Uint8Array(response.signature),
			authenticatorData: new Uint8Array(response.authenticatorData),
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