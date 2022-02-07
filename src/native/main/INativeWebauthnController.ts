import type {U2fRegisteredDevice} from "../../api/entities/sys/U2fRegisteredDevice"
import {U2fChallenge} from "../../api/entities/sys/U2fChallenge"
import {WebauthnResponseData} from "../../api/entities/sys/WebauthnResponseData"

export interface INativeWebauthnController {
	register(domain: string, userId: Id, name: string, mailAddress: string): Promise<U2fRegisteredDevice>
	sign(domain: string, challenge: U2fChallenge): Promise<WebauthnResponseData>
}