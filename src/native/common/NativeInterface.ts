import type {Request} from "../../api/common/MessageDispatcher"
import {INativeWebauthnController} from "../main/INativeWebauthnController"

export interface NativeInterface {
	invokeNative(msg: Request<NativeRequestType>): Promise<any>
}

export interface ExposedNativeInterface {
	webauthnController: INativeWebauthnController,
}