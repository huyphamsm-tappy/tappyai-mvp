package com.tappyai.app.notifications

import com.tappyai.core.deeplink.DeepLinkParser
import com.tappyai.core.navigation.TappyRoute

/**
 * What a tapped notification means.
 *
 * Not a new navigation system: a notification carries a deep link in its payload and that link is
 * handed to the SAME [DeepLinkParser] chain the app already uses for `tappyai://` links. A
 * notification is just another external entry point, so it should not get a private idea of where
 * screens live.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it never reads `title` or `body`. Tapping a notification is
 * the moment it would be easiest to justify "just read it out" — so the content simply is not
 * available on this path. There is no field here that could reach a speech synthesiser.
 */
data class TappyNotificationClick(
    val kind: TappyNotificationKind,
    /** Deep link to open, or null when the payload carries none — then the app just opens. */
    val link: String?,
    /**
     * The rest of the payload, minus the keys this class consumes. Kept so a future FCM service can
     * forward analytics or campaign ids without this contract needing to change — and deliberately
     * still excluding title/body, which never enter this path at all.
     */
    val metadata: Map<String, String>,
) {
    companion object {
        private val CONSUMED = setOf("kind", "link", "url", "title", "body")

        /**
         * Reads a click out of a push payload's `data` map. Every failure mode degrades rather than
         * throwing: a null map, an absent link, a blank link, an unknown kind — a tapped
         * notification must open the app, never crash it.
         */
        @JvmStatic
        fun from(data: Map<String, String>?): TappyNotificationClick {
            val safe = data.orEmpty()
            val link = (safe["link"] ?: safe["url"])?.takeIf { it.isNotBlank() }
            return TappyNotificationClick(
                kind = TappyNotificationKind.from(data),
                link = link,
                metadata = safe.filterKeys { it !in CONSUMED },
            )
        }
    }
}

object TappyNotificationRouting {

    /**
     * Resolves a click to a destination using the app's existing parsers.
     *
     * The kind is intentionally NOT consulted: an identity notification is a SOUND, not a different
     * destination. Routing on kind would mean the chime could silently send the user somewhere else
     * than the same notification without it.
     *
     * Returns null for "no specific destination" — the caller opens the app as normal. A parser
     * that throws on a malformed link is contained here, because a bad link in a payload the app
     * did not write must not become a crash on tap.
     */
    fun destinationFor(click: TappyNotificationClick, parsers: List<DeepLinkParser>): TappyRoute? {
        val link = click.link ?: return null
        return parsers.firstNotNullOfOrNull { parser -> runCatching { parser.parse(link) }.getOrNull() }
    }
}
