import type {INativeWebauthnController} from "../../native/main/INativeWebauthnController.js"
import type {U2fRegisteredDevice} from "../../api/entities/sys/U2fRegisteredDevice.js"
import {app, BrowserWindow, ipcMain} from "electron"
import path from "path"
import {WebContentsEvent} from "../ElectronExportTypes.js"
import {Message, MessageDispatcher, Request, Transport} from "../../api/common/MessageDispatcher.js"
import {defer} from "@tutao/tutanota-utils"
import {NativeToWebRequest, WebToNativeRequest} from "../../native/main/WebauthnNativeBridge.js"
import {CancelledError} from "../../api/common/error/CancelledError"
import {U2fChallenge} from "../../api/entities/sys/U2fChallenge"
import {WebauthnResponseData} from "../../api/entities/sys/WebauthnResponseData"
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

export class DesktopWebauthnController implements INativeWebauthnController {
	private readonly centralIpcHandler = new CentralIpcHandler(ipcMain)

	private async init(webContents: WebContents): Promise<MessageDispatcher<NativeToWebRequest, WebToNativeRequest>> {
		const deferred = defer<void>()

		const transport = new ElectronNativeTransport(webContents, this.centralIpcHandler)
		const dispatcher = new MessageDispatcher<NativeToWebRequest, WebToNativeRequest>(transport, {
			"init": () => {
				deferred.resolve()
				return Promise.resolve()
			}
		})
		await deferred.promise
		return dispatcher
	}

	private async uninint(webContents: WebContents) {
		this.centralIpcHandler.removeHandler(webContents.id)
	}

	async register(domain: string, userId: Id, name: string, mailAddress: string): Promise<U2fRegisteredDevice> {
		const {bw, dispatcher} = await this.createBrowserWindow(domain)

		const closeDefer = defer<never>()
		bw.on("close", () => {
			closeDefer.reject(new CancelledError("Window closed"))
		})
		const response = await Promise.race([
			dispatcher.postRequest(new Request("register", [userId, name, mailAddress])),
			closeDefer.promise
		])
		bw.close()
		console.log("registered", bw.webContents.id)
		return response
	}

	async sign(domain: string, challenge: U2fChallenge): Promise<WebauthnResponseData> {
		const {bw, dispatcher} = await this.createBrowserWindow(domain)

		const closeDefer = defer<never>()
		bw.on("close", () => {
			closeDefer.reject(new CancelledError("Window closed"))
		})
		const response = await Promise.race([
			dispatcher.postRequest(new Request("authenticate", [challenge])),
			closeDefer.promise
		])
		bw.close()
		console.log("authenticated", bw.webContents.id)
		return response
	}

	private async createBrowserWindow(domain: string) {
		// TODO: this needs proper settings
		// TODO: this should be a modal window (pass parent window to it somehow)
		const bw = new BrowserWindow({
			center: true,
			width: 800,
			height: 800,
			webPreferences: {
				preload: path.join(app.getAppPath(), "./desktop/preload-webauthn.js")
			}
		})
		const url = new URL(domain + "/webauthn")
		console.log("webauthn url", url.toString())

		await bw.loadURL(url.toString())
		const dispatcher = await this.init(bw.webContents)
		console.log("initialized for bw", bw.webContents.id)
		bw.webContents.on("destroyed", () => this.uninint(bw.webContents))
		return {bw, dispatcher}
	}
}