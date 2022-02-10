export interface WebAuthnRegistrationChallenge {
	challenge: Uint8Array
	userId: string
	name: string
	displayName: string
	domain: string
}

/**
 * Result of Webauthn registration with hardware key.
 *
 * Custom type as opposed to PublicKeyCredential and AuthenticatorAttestationResponse because:
 * 1. Built-in type is not a plain type, we can't send it over IPC or easily clone
 * 2. We need rpId which was actually used
 * 3. More precise: we know that attestationObject is there
 */
export interface WebauthnRegistrationResult {
	rpId: string
	rawId: ArrayBuffer
	attestationObject: ArrayBuffer
}

export interface WebAuthnSignChallenge {
	challenge: Uint8Array
	keys: Array<PublicKeyCredentialDescriptor>
	domain: string
}

/**
 * Result of Webauthn authentication with hardware key.
 *
 * See {@link WebauthnRegistrationResult} for motivation.
 */
export interface WebauthnSignResult {
	rawId: ArrayBuffer
	clientDataJSON: ArrayBuffer
	signature: ArrayBuffer
	authenticatorData: ArrayBuffer
}

export interface ExposedWebauthnInterface {
	webauthn: IWebauthn
}

/** Actual web authentication implementation. Should not be used directly. */
export interface IWebauthn {
	isSupported(): boolean;

	canAttemptChallengeForRpId(rpId: string): boolean;

	canAttemptChallengeForU2FAppId(appId: string): boolean;

	register(challenge: WebAuthnRegistrationChallenge): Promise<WebauthnRegistrationResult>;

	sign(challenge: WebAuthnSignChallenge): Promise<WebauthnSignResult>;
}

