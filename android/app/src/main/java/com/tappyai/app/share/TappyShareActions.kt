package com.tappyai.app.share

/**
 * What a share target *does*, decided without touching the Android framework.
 *
 * `TappyShare.buildShareUrl` answers a narrower question — which network accepts a URL handoff — and
 * returns null for TikTok, copy and native. Null is an honest answer but not an instruction, so the
 * translation from "no handoff exists" to "use the system chooser" lives here rather than inside a
 * composable, where it could only be verified on a device.
 */
sealed interface ShareAction {
    /** Open a network's own share dialog in the browser. */
    data class OpenUrl(val url: String) : ShareAction

    /** Hand the link to the Android chooser. Whether TikTok appears is the OS's business. */
    data class SystemShare(val text: String) : ShareAction

    data class CopyLink(val url: String) : ShareAction

    /** The URL failed the share guard. Doing nothing is the correct behaviour. */
    data object Unsupported : ShareAction
}

object TappyShareActions {

    /**
     * The action for a target, or [ShareAction.Unsupported] when the URL is not shareable.
     *
     * TikTok resolves to the system chooser: TikTok publishes no public web endpoint for handing off
     * an arbitrary link, and inventing one would ship a 404. If the app is installed the OS may
     * offer it as a destination — that is the user posting, not TappyAI.
     */
    fun actionFor(target: TappyShare.Target, canonicalUrl: String): ShareAction {
        if (!TappyShare.isShareableUrl(canonicalUrl)) return ShareAction.Unsupported
        return when (target) {
            TappyShare.Target.FACEBOOK,
            TappyShare.Target.ZALO,
            -> TappyShare.buildShareUrl(target, canonicalUrl)
                ?.let { ShareAction.OpenUrl(it) }
                ?: ShareAction.Unsupported

            TappyShare.Target.TIKTOK,
            TappyShare.Target.NATIVE,
            -> ShareAction.SystemShare(canonicalUrl)

            TappyShare.Target.COPY -> ShareAction.CopyLink(canonicalUrl)
        }
    }
}
