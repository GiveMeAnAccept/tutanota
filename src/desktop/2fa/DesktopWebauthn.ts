import {
	ExposedWebauthnInterface,
	IWebauthn,
	WebAuthnRegistrationChallenge,
	WebauthnRegistrationResult,
	WebAuthnSignChallenge,
	WebauthnSignResult
} from "../../misc/2fa/webauthn/IWebauthn.js"
import type {CentralIpcHandler} from "../ipc/CentralIpcHandler.js"
import {WebDialog} from "../WebDialog.js"

export const webauthnIpcConfig = Object.freeze({
	renderToMainEvent: "to-main-webauthn",
	mainToRenderEvent: "to-renderer-webauthn"
})
export type WebauthnIpcConfig = typeof webauthnIpcConfig
export type WebauthnIpcHandler = CentralIpcHandler<WebauthnIpcConfig>

export class DesktopWebauthn implements IWebauthn {

	constructor(private readonly centralIpcHandler: WebauthnIpcHandler) {
	}

	async register(challenge: WebAuthnRegistrationChallenge): Promise<WebauthnRegistrationResult> {
		const {domain} = challenge
		const response = await WebDialog.show<WebauthnIpcConfig, ExposedWebauthnInterface, WebauthnRegistrationResult>(
			new URL(domain + "/webauthn"),
			this.centralIpcHandler,
			facade => facade.webauthn.register(challenge)
		)
		console.log("registered")
		return response
	}

	async sign(challenge: WebAuthnSignChallenge): Promise<WebauthnSignResult> {
		const {domain} = challenge
		const response = await WebDialog.show<WebauthnIpcConfig, ExposedWebauthnInterface, WebauthnSignResult>(
			new URL(domain + "/webauthn"),
			this.centralIpcHandler,
			facade => facade.webauthn.sign(challenge)
		)
		console.log("authenticated")
		return response
	}

	canAttemptChallengeForRpId(rpId: string): boolean {
		return true
	}

	canAttemptChallengeForU2FAppId(appId: string): boolean {
		return true
	}

	isSupported(): boolean {
		return true
	}
}