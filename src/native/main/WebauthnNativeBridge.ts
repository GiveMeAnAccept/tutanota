import {Commands, MessageDispatcher, Request} from "../../api/common/MessageDispatcher.js"
import {DesktopTransport} from "./NativeInterfaceMain.js"
import {U2fRegisteredDevice} from "../../api/entities/sys/U2fRegisteredDevice.js"
import {U2fChallenge} from "../../api/entities/sys/U2fChallenge"
import {WebauthnResponseData} from "../../api/entities/sys/WebauthnResponseData"

export type WebToNativeRequest = "init"
export type NativeToWebRequest = "register" | "authenticate"

type Handlers = {
	onRegister: (userId: string, name: string, mailAddress: string) => Promise<U2fRegisteredDevice>,
	onAuthenticate: (challenge: U2fChallenge) => Promise<WebauthnResponseData>,
}

export class WebauthnNativeBridge {
	private readonly dispatcher: MessageDispatcher<WebToNativeRequest, NativeToWebRequest>
	private handlers!: Handlers

	constructor() {
		// @ts-ignore
		const nativeApp: NativeApp = window.nativeAppWebauthn
		const transport: DesktopTransport<WebToNativeRequest, NativeToWebRequest> = new DesktopTransport(nativeApp)
		const commands: Commands<NativeToWebRequest> = {
			"register": async (msg)  => {
				const [userId, name, mailAddress] = msg.args
				return this.handlers.onRegister(userId, name, mailAddress)
			},
			"authenticate": async (msg) => {
				const [challenge] = msg.args
				return this.handlers.onAuthenticate(challenge)
			}
		}
		this.dispatcher = new MessageDispatcher<WebToNativeRequest, NativeToWebRequest>(transport, commands)
	}

	init(handlers: Handlers): Promise<void> {
		this.handlers = handlers
		return this.dispatcher.postRequest(new Request("init", []))
	}
}