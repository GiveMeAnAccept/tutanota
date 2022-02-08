import type {Request} from "../../api/common/MessageDispatcher"
import {IWebauthn} from "../../misc/2fa/webauthn/WebauthnClient"

export interface NativeInterface {
	invokeNative(msg: Request<NativeRequestType>): Promise<any>
}

export interface ExposedNativeInterface {
	webauthnController: IWebauthn,
}