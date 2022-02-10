import {app, BrowserWindow, WebContents} from "electron"
import path from "path"
import {defer} from "@tutao/tutanota-utils"
import {ElectronWebContentsTransport} from "./ipc/ElectronWebContentsTransport"
import {NativeToWebRequest, WebToNativeRequest} from "../native/main/WebauthnNativeBridge"
import {MessageDispatcher} from "../api/common/MessageDispatcher"
import {exposeRemote} from "../api/common/WorkerProxy"
import {CancelledError} from "../api/common/error/CancelledError"
import {CentralIpcHandler, IpcConfig} from "./ipc/CentralIpcHandler"

/**
 * a browserWindow wrapper that
 * * opens a specific website
 * * installs a nativeBrigde
 * * sends a request to the webContents
 * * returns the result of the call
 *
 * TODO: make this work with the default preload.js and make it possible to filter the messages it should handle
 */

export class WebDialog {

	private constructor() {
	}

	static async show<IpcConfigType extends IpcConfig<string, string>,
		FacadeType, ResponseType>(
		urlToOpen: URL,
		dispatcher: CentralIpcHandler<IpcConfigType>,
		requestSender: (facade: FacadeType) => Promise<ResponseType>,
	): Promise<ResponseType> {
		const bw = await WebDialog.createBrowserWindow()
		const closeDefer = defer<never>()
		bw.on("close", () => {
			closeDefer.reject(new CancelledError("Window closed"))
		})
		bw.webContents.openDevTools()
		bw.once('ready-to-show', () => bw.show())
		await bw.loadURL(urlToOpen.toString())
		const facade = await WebDialog.initRemoteWebauthn<FacadeType, IpcConfigType>(bw.webContents, dispatcher)
		console.log("initialized for bw", bw.webContents.id)
		bw.webContents.on("destroyed", () => WebDialog.uninitRemoteWebauthn(bw.webContents, dispatcher))

		return Promise.race([
			closeDefer.promise,
			requestSender(facade)
		]).finally(() => bw.close())
	}

	private static async createBrowserWindow() {
		// TODO: this needs proper settings
		// TODO: this should be a modal window (pass parent window to it somehow)
		const active = BrowserWindow.getFocusedWindow()

		return new BrowserWindow({
			parent: active ?? undefined,
			modal: true,
			skipTaskbar: true,
			resizable: false,
			movable: false,
			alwaysOnTop: true,
			fullscreenable: false,
			frame: false,
			width: 400,
			height: 200,
			autoHideMenuBar: true,
			show: false,
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
				preload: path.join(app.getAppPath(), "./desktop/preload-webdialog.js"),
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
	}

	private static async initRemoteWebauthn<FacadeType,
		IpcConfigType extends IpcConfig<string, string>>(webContents: WebContents, handler: CentralIpcHandler<IpcConfigType>): Promise<FacadeType> {
		const deferred = defer<void>()
		const transport = new ElectronWebContentsTransport<IpcConfigType, "facade", "init">(webContents, handler)
		const dispatcher = new MessageDispatcher<NativeToWebRequest, WebToNativeRequest>(transport, {
			"init": () => {
				deferred.resolve()
				return Promise.resolve()
			}
		})
		await deferred.promise
		return exposeRemote<FacadeType>(req => dispatcher.postRequest(req))
	}

	private static async uninitRemoteWebauthn(webContents: WebContents, handler: CentralIpcHandler<IpcConfig<string, string>>) {
		handler.removeHandler(webContents.id)
	}

}