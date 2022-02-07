import type {CurrentView} from "../gui/base/Header.js"
import type {Children, Vnode} from "mithril"
import m from "mithril"
import {WebauthnClient} from "../misc/2fa/webauthn/WebauthnClient"
import type {WebauthnNativeBridge} from "../native/main/WebauthnNativeBridge"
import {U2fRegisteredDevice} from "../api/entities/sys/U2fRegisteredDevice"
import {U2fChallenge} from "../api/entities/sys/U2fChallenge"
import {WebauthnResponseData} from "../api/entities/sys/WebauthnResponseData"

const enum State {
	None,
	Registering,
	Auth
}

export class NativeWebauthnView implements CurrentView {
	private state: State = State.None

	constructor(
		private readonly webauthnClient: WebauthnClient,
		private readonly nativeTransport: WebauthnNativeBridge
	) {
		this.view = this.view.bind(this)
		this.nativeTransport.init({
			onRegister: (userId, name, mailAddress) => {
				this.state = State.Registering
				m.redraw()
				return this.doRegister(userId, name, mailAddress)
			},
			onAuthenticate: (challenge) => {
				this.state = State.Auth
				m.redraw()
				return this.doSign(challenge)
			}
		})
	}

	updateUrl(args: Record<string, any>, requestedPath: string): void {
	}

	view(vnode: Vnode): Children {
		return m(".mt.flex.col.flex-center.center", {
				style: {
					maxWidth: "300px",
					margin: "0 auto",
				}
			}, [
				this.renderState(),
				m("div", `webauthn support: ${String(this.webauthnClient.isSupported())}`),
			]
		)
	}

	private renderState(): Children {
		switch (this.state) {
			case State.None:
				return "-"
			case State.Auth:
				return "authenticating"
			case State.Registering:
				return "registering"
		}
	}

	private async doRegister(userId: string, name: string, mailAddress: string): Promise<U2fRegisteredDevice> {
		const registered = await this.webauthnClient.register(userId, name, mailAddress, new AbortController().signal)
		console.log("registered", registered)
		return registered
	}

	private doSign(challenge: U2fChallenge): Promise<WebauthnResponseData> {
		return this.webauthnClient.sign(challenge)
	}
}