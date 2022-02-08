import type {CurrentView} from "../gui/base/Header.js"
import type {Children, Vnode} from "mithril"
import m from "mithril"
import {IWebauthn, WebauthnClient} from "../misc/2fa/webauthn/WebauthnClient"
import type {WebauthnNativeBridge} from "../native/main/WebauthnNativeBridge"
import {U2fRegisteredDevice} from "../api/entities/sys/U2fRegisteredDevice"
import {U2fChallenge} from "../api/entities/sys/U2fChallenge"
import {WebauthnResponseData} from "../api/entities/sys/WebauthnResponseData"
import {PublicKeyCredential} from "../misc/2fa/webauthn/WebauthnTypes"

const enum State {
	None,
	Registering,
	Auth
}

export class NativeWebauthnView implements CurrentView {
	private state: State = State.None

	constructor(
		private readonly webauthn: IWebauthn,
		private readonly nativeTransport: WebauthnNativeBridge
	) {
		this.view = this.view.bind(this)
		// TODO: maybe wrap in some gui idk
		this.nativeTransport.init(this.webauthn)
		// this.nativeTransport.init({
		// 	onRegister: (challenge, id, name, displayName) => {
		// 		this.state = State.Registering
		// 		m.redraw()
		// 		return this.doRegister(challenge, id, name, displayName)
		// 	},
		// 	onAuthenticate: (challenge, keys) => {
		// 		this.state = State.Auth
		// 		m.redraw()
		// 		return this.doSign(challenge, keys)
		// 	}
		// })
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
				m("div", `webauthn support: ${String(this.webauthn.isSupported())}`),
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

	// @ts-ignore
	private async doRegister(challenge, id, name, displayName): Promise<{credential: PublicKeyCredential, rpId: string}> {
		const registered = await this.webauthn.register(challenge, id, name, displayName)
		console.log("registered", registered)
		return registered
	}

	// @ts-ignore
	private doSign(challenge, keys): Promise<PublicKeyCredential> {
		return this.webauthn.sign(challenge, keys)
	}
}