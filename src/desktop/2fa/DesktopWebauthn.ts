import {
	ExposedWebauthnInterface,
	IWebauthn,
	WebAuthnRegistrationChallenge,
	WebauthnRegistrationResult,
	WebAuthnSignChallenge,
	WebauthnSignResult
} from "../../misc/2fa/webauthn/IWebauthn.js"
import type {IWebDialog} from "../WebDialog.js"

export class DesktopWebauthn implements IWebauthn {
	constructor(private readonly webDialog: IWebDialog) {
	}

	async register(challenge: WebAuthnRegistrationChallenge): Promise<WebauthnRegistrationResult> {
		const {domain} = challenge
		return this.webDialog.show<ExposedWebauthnInterface, WebauthnRegistrationResult>(
			new URL(domain + "/webauthn"),
			(remote) => remote.webauthn.register(challenge)
		)
	}

	async sign(challenge: WebAuthnSignChallenge): Promise<WebauthnSignResult> {
		const {domain} = challenge
		return this.webDialog.show<ExposedWebauthnInterface, WebauthnSignResult>(
			new URL(domain + "/webauthn"),
			(remote) => remote.webauthn.sign(challenge)
		)
	}

    async canAttemptChallengeForRpId(rpId: string): Promise<boolean> {
		return true
	}

	async canAttemptChallengeForU2FAppId(appId: string): Promise<boolean> {
		return true
	}

	async isSupported(): Promise<boolean> {
		return true
	}

	async abortCurrentOperation(): Promise<void> {
		// no-op for now, we would need to close window here
	}
}