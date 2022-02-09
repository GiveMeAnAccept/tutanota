import {app, BrowserWindow, WebContents} from "electron"
import path from "path"
import {MessageDispatcher} from "../../api/common/MessageDispatcher.js"
import {defer} from "@tutao/tutanota-utils"
import {NativeToWebRequest, WebToNativeRequest} from "../../native/main/WebauthnNativeBridge.js"
import {CancelledError} from "../../api/common/error/CancelledError.js"
import {exposeRemote} from "../../api/common/WorkerProxy.js"
import {IWebauthn, WebAuthnRegistrationChallenge, WebauthnRegistrationResult, WebauthnSignResult} from "../../misc/2fa/webauthn/IWebauthn.js";
import type {CentralIpcHandler} from "../ipc/CentralIpcHandler.js"
import {ElectronWebContentsTransport} from "../ipc/ElectronWebContentsTransport"

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
		// TODO:
		const domain = "https://local.tutanota.com:9000/client/build"
		const {bw, webauthn} = await this.createBrowserWindow(domain)

		const closeDefer = defer<never>()
		bw.on("close", () => {
			closeDefer.reject(new CancelledError("Window closed"))
		})
		const response = await Promise.race([
			webauthn.register(challenge),
			closeDefer.promise
		])
		bw.close()
		console.log("registered", bw.webContents.id)
		return response
	}

	async sign(challenge: Uint8Array, keys: Array<PublicKeyCredentialDescriptor>): Promise<WebauthnSignResult> {
		// TODO:
		const domain = "https://local.tutanota.com:9000/client/build"
		const {bw, webauthn} = await this.createBrowserWindow(domain)

		const closeDefer = defer<never>()
		bw.on("close", () => {
			closeDefer.reject(new CancelledError("Window closed"))
		})
		const response = await Promise.race([
			webauthn.sign(challenge, keys),
			closeDefer.promise
		])
		bw.close()
		console.log("authenticated", bw.webContents.id)
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

	private async createBrowserWindow(domain: string) {
		// TODO: this needs proper settings
		// TODO: this should be a modal window (pass parent window to it somehow)
		const active = BrowserWindow.getFocusedWindow()

		const bw = new BrowserWindow({
			parent: active ?? undefined,
			modal: true,
			width: 400,
			height: 200,
			autoHideMenuBar: true,
			webPreferences: {
				nodeIntegration: false,
				nodeIntegrationInWorker: false,
				nodeIntegrationInSubFrames: false,
				sandbox: true,
				contextIsolation: true,
				webSecurity: true,
				// @ts-ignore see: https://github.com/electron/electron/issues/30789
				enableRemoteModule: false,
				allowRunningInsecureContent: false,
				preload: path.join(app.getAppPath(), "./desktop/preload-webauthn.js"),
				webgl: false,
				plugins: false,
				experimentalFeatures: false,
				webviewTag: false,
				disableDialogs: true,
				navigateOnDragDrop: false,
				autoplayPolicy: "user-gesture-required",
				enableWebSQL: false,
				spellcheck: false,
			},
		})
		const url = new URL(domain + "/webauthn")
		console.log("webauthn url", url.toString())

		await bw.loadURL(url.toString())
		const dispatcher = await this.initRemoteWebauthn(bw.webContents)
		console.log("initialized for bw", bw.webContents.id)
		bw.webContents.on("destroyed", () => this.uninintRemoveWebauthn(bw.webContents))
		return {bw, webauthn: dispatcher}
	}

	private async initRemoteWebauthn(webContents: WebContents): Promise<IWebauthn> {
		const deferred = defer<void>()
		const transport = new ElectronWebContentsTransport<WebauthnIpcConfig, NativeToWebRequest, WebToNativeRequest>(webContents, this.centralIpcHandler)
		const dispatcher = new MessageDispatcher<NativeToWebRequest, WebToNativeRequest>(transport, {
			"init": () => {
				deferred.resolve()
				return Promise.resolve()
			}
		})
		await deferred.promise
		return exposeRemote<{webauthn: IWebauthn}>(req => dispatcher.postRequest(req)).webauthn
	}

	private async uninintRemoveWebauthn(webContents: WebContents) {
		this.centralIpcHandler.removeHandler(webContents.id)
	}
}