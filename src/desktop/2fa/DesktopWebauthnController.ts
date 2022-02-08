import {app, BrowserWindow, ipcMain} from "electron"
import path from "path"
import {WebContentsEvent} from "../ElectronExportTypes.js"
import {Message, MessageDispatcher, Transport} from "../../api/common/MessageDispatcher.js"
import {defer} from "@tutao/tutanota-utils"
import {NativeToWebRequest, WebToNativeRequest} from "../../native/main/WebauthnNativeBridge.js"
import {CancelledError} from "../../api/common/error/CancelledError"
import type {IWebauthn, WebAuthnChallenge} from "../../misc/2fa/webauthn/WebauthnClient"
import {exposeRemote} from "../../api/common/WorkerProxy.js"
import {PublicKeyCredential} from "../../misc/2fa/webauthn/WebauthnTypes"
import WebContents = Electron.WebContents
import IpcMain = Electron.IpcMain

type RequestHandler = (message: Message<WebToNativeRequest>) => unknown

// This thing exists purely because we can't call "ipcMain.handle" twice
class CentralIpcHandler {
	private readonly map = new Map<number, RequestHandler>()

	constructor(ipcMain: IpcMain) {
		ipcMain.handle("to-main-webauthn", (ev: WebContentsEvent, request) => {
			this.map.get(ev.sender.id)?.(request)
		})
	}

	addHandler(webContentsId: number, handler: RequestHandler) {
		this.map.set(webContentsId, handler)
	}

	removeHandler(webContentsId: number) {
		this.map.delete(webContentsId)
	}
}

class ElectronNativeTransport implements Transport<NativeToWebRequest, WebToNativeRequest> {
	constructor(
		private readonly webContents: WebContents,
		private readonly ipcHandler: CentralIpcHandler,
	) {
	}

	postMessage(message: Message<NativeToWebRequest>): void {
		this.webContents.send("to-renderer-webauthn", message)
	}

	setMessageHandler(handler: (message: Message<WebToNativeRequest>) => unknown): void {
		this.ipcHandler.addHandler(this.webContents.id, handler)
	}
}

export class DesktopWebauthnController implements IWebauthn {
	private readonly centralIpcHandler = new CentralIpcHandler(ipcMain)

	private async init(webContents: WebContents): Promise<IWebauthn> {
		const deferred = defer<void>()

		const transport = new ElectronNativeTransport(webContents, this.centralIpcHandler)
		const dispatcher = new MessageDispatcher<NativeToWebRequest, WebToNativeRequest>(transport, {
			"init": () => {
				deferred.resolve()
				return Promise.resolve()
			}
		})
		await deferred.promise
		return exposeRemote<{webauthn: IWebauthn}>(req => dispatcher.postRequest(req)).webauthn
	}

	private async uninint(webContents: WebContents) {
		this.centralIpcHandler.removeHandler(webContents.id)
	}

	async register(challenge: WebAuthnChallenge): Promise<{credential: PublicKeyCredential, rpId: string}> {
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
		//bw.close()
		console.log("registered", bw.webContents.id)
		return response
	}

	async sign(challenge: Uint8Array, keys: Array<PublicKeyCredentialDescriptor>): Promise<PublicKeyCredential> {
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
		const bw = new BrowserWindow({
			center: true,
			width: 800,
			height: 800,
			webPreferences: {
				preload: path.join(app.getAppPath(), "./desktop/preload-webauthn.js"),

			}
		})
		bw.webContents.openDevTools()
		const url = new URL(domain + "/webauthn")
		console.log("webauthn url", url.toString())

		await bw.loadURL(url.toString())
		const dispatcher = await this.init(bw.webContents)
		console.log("initialized for bw", bw.webContents.id)
		bw.webContents.on("destroyed", () => this.uninint(bw.webContents))
		return {bw, webauthn: dispatcher}
	}
}