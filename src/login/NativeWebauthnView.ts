import type {CurrentView} from "../gui/base/Header.js"
import type {Children, Vnode} from "mithril"
import m from "mithril"
import {DialogHeaderBar, DialogHeaderBarAttrs} from "../gui/base/DialogHeaderBar.js"
import type {WebauthnNativeBridge} from "../native/main/WebauthnNativeBridge"
import {IWebauthn} from "../misc/2fa/webauthn/IWebauthn.js"
import {SecondFactorImage} from "../gui/base/icons/Icons.js"
import {progressIcon} from "../gui/base/Icon.js"
import {lang} from "../misc/LanguageViewModel.js"
import {ButtonType} from "../gui/base/ButtonN.js"

export class NativeWebauthnView implements CurrentView {
	constructor(
		private readonly webauthn: IWebauthn,
		private readonly nativeTransport: WebauthnNativeBridge
	) {
		this.view = this.view.bind(this)
		this.nativeTransport.init(this.webauthn)
	}

	updateUrl(args: Record<string, any>, requestedPath: string): void {
	}

	view(vnode: Vnode): Children {

		const headerBarAttrs: DialogHeaderBarAttrs = {
			left: [{
				label: "cancel_action",
				click: () => window.close(),
				type: ButtonType.Primary
			}],
			right: [],
			middle: () => lang.get("u2fSecurityKey_label"),
		}

		return m(".mt.flex.col.flex-center.center", {
				style: {
					margin: "0 auto",
				}
			},
			[
				m(".flex.col.justify-center.mt-s", [
					m(".dialog-header.plr-l", m(DialogHeaderBar, headerBarAttrs)),
					m(".flex-center", m("img[src=" + SecondFactorImage + "]")),
					m(".mt.flex.col", [
						m(".flex.justify-center", [m(".mr-s", progressIcon()), m("", lang.get("waitingForU2f_msg"))])
					])
				])
			]
		)
	}
}