package com.tappyai.app.share

/**
 * The share targets, mirroring the web contract in `src/lib/share/shareTargets.ts`.
 *
 * Android already had a system share sheet, which is the right primitive but not
 * the whole experience: it surfaces whatever happens to be installed and gives
 * the user no explicit Facebook / TikTok / Zalo choice. This adds those targets
 * on top; the system sheet stays as "More apps".
 *
 * URL handoff only for the social dialogs. TappyAI does not publish to any of
 * these networks, so nothing here may report that a post was made.
 *
 * 🔑 WHAT ANDROID CAN DO THAT THE WEB CANNOT: hand the brochure TEXT (and an
 * image) straight to a specific app with `ACTION_SEND` + `setPackage`. A
 * Messenger, Zalo, WhatsApp, Telegram, Viber or LINE that is installed receives
 * the recommendation itself, not a brand link — that is a genuine direct
 * integration, and [packageFor]
 * names the packages. Declared in the manifest `<queries>` so the resolution is
 * honest on Android 11+. An app that is NOT installed throws
 * `ActivityNotFoundException`, and the caller copies + says so; it never
 * pretends the app opened.
 */
object TappyShare {

    /** Canonical public origin. Must match NEXT_PUBLIC_SITE_URL on the web. */
    const val CANONICAL_ORIGIN: String = "https://www.tappyai.com"

    enum class Target(val id: String) {
        FACEBOOK("facebook"),
        MESSENGER("messenger"),
        ZALO("zalo"),
        WHATSAPP("whatsapp"),
        TELEGRAM("telegram"),
        VIBER("viber"),
        LINE("line"),
        TIKTOK("tiktok"),
        EMAIL("email"),
        INBOX("inbox"),
        SAVE("save"),
        COPY("copy"),
        NATIVE("native"),
    }

    /** Display order, identical to web. */
    val targets: List<Target> = listOf(
        Target.FACEBOOK,
        Target.MESSENGER,
        Target.ZALO,
        Target.WHATSAPP,
        Target.TELEGRAM,
        Target.VIBER,
        Target.LINE,
        Target.TIKTOK,
        Target.EMAIL,
        Target.INBOX,
        Target.SAVE,
        Target.COPY,
        Target.NATIVE,
    )

    /**
     * The installed app that receives an `ACTION_SEND` for this target, or null.
     *
     * Facebook has no package here: it is the sharer dialog with the brand url
     * ([buildShareUrl]), the same as on the web. Messenger is the app that
     * receives a recommendation as a message to a person.
     */
    fun packageFor(target: Target): String? = when (target) {
        Target.MESSENGER -> "com.facebook.orca"
        Target.ZALO -> "com.zing.zalo"
        Target.WHATSAPP -> "com.whatsapp"
        Target.TELEGRAM -> "org.telegram.messenger"
        Target.VIBER -> "com.viber.voip"
        Target.LINE -> "jp.naver.line.android"
        else -> null
    }

    /** Every package this app may resolve — the manifest `<queries>` must list exactly these. */
    val queriedPackages: List<String> = listOf(
        "com.facebook.orca", "com.zing.zalo", "com.whatsapp", "org.telegram.messenger", "com.viber.voip", "jp.naver.line.android",
    )

    private val canonicalHost = Regex("^(www\\.)?tappyai\\.(com|vn)$", RegexOption.IGNORE_CASE)
    private val nonShareablePath = Regex("^/(api|chat|admin|auth|login)(/|$)", RegexOption.IGNORE_CASE)

    /**
     * True when a URL is safe to hand to another app.
     *
     * Same rules as the web guard: https, canonical host, no query string (that
     * is where tokens live), and no private or internal route. A storage object
     * URL fails the host check, so a Blob or Cloud Storage link can never be
     * shared as if it were a page.
     */
    fun isShareableUrl(url: String?): Boolean {
        if (url.isNullOrEmpty()) return false
        val parsed = runCatching { java.net.URI(url) }.getOrNull() ?: return false
        if (parsed.scheme?.lowercase() != "https") return false
        val host = parsed.host ?: return false
        if (!canonicalHost.matches(host)) return false
        if (!parsed.rawQuery.isNullOrEmpty()) return false
        val path = parsed.path ?: "/"
        if (nonShareablePath.containsMatchIn(path)) return false
        return true
    }

    /**
     * The URL that opens a target's share dialog, or null when there isn't one.
     *
     * Null is a real answer: TikTok publishes no web endpoint for handing off an
     * arbitrary link, and everything that is not a url handoff returns null too.
     * Callers copy the link instead — never fabricate a URL, never claim a post happened.
     */
    fun buildShareUrl(target: Target, canonicalUrl: String): String? {
        if (!isShareableUrl(canonicalUrl)) return null
        val encoded = java.net.URLEncoder.encode(canonicalUrl, "UTF-8")
        return when (target) {
            Target.FACEBOOK -> "https://www.facebook.com/sharer/sharer.php?u=$encoded"
            Target.ZALO -> "https://sp.zalo.me/plugins/share?url=$encoded"
            // Messenger's own share deep link (developers.facebook.com/docs/sharing/messenger).
            Target.MESSENGER -> "fb-messenger://share?link=$encoded"
            Target.WHATSAPP, Target.TELEGRAM, Target.VIBER, Target.LINE, Target.EMAIL, Target.INBOX,
            Target.SAVE, Target.COPY, Target.NATIVE, Target.TIKTOK -> null
        }
    }

    /** Text carried inside a handoff URI has a practical ceiling — same bound as the web. */
    const val TEXT_HANDOFF_MAX: Int = 4000

    /**
     * The URI that opens a target WITH THE BROCHURE TEXT in it, or null.
     *
     * Mirrors the web `buildTextShareUrl`. On Android these are the fallbacks for
     * when the app package is not installed; the primary path is [packageFor].
     * `url` is the canonical link Telegram receives separately from the text.
     */
    fun buildTextShareUrl(target: Target, subject: String, text: String, url: String = ""): String? {
        val body = text.trim()
        if (body.isEmpty()) return null
        val clipped = if (body.length > TEXT_HANDOFF_MAX) body.take(TEXT_HANDOFF_MAX) else body
        val enc = java.net.URLEncoder.encode(clipped, "UTF-8").replace("+", "%20")
        return when (target) {
            Target.EMAIL -> "mailto:?subject=${java.net.URLEncoder.encode(subject, "UTF-8").replace("+", "%20")}&body=$enc"
            Target.VIBER -> "viber://forward?text=$enc"
            Target.LINE -> "https://line.me/R/share?text=$enc"
            // WhatsApp "click to chat" (faq.whatsapp.com/5913398998672934): the text is the message.
            Target.WHATSAPP -> "https://wa.me/?text=$enc"
            // Telegram share widget (core.telegram.org/widgets/share): a link plus an optional text.
            // When the text IS the link (a review), it goes once, as the url.
            Target.TELEGRAM -> {
                val link = url.trim().ifEmpty { clipped }
                val encodedLink = java.net.URLEncoder.encode(link, "UTF-8").replace("+", "%20")
                if (clipped == link) "https://t.me/share/url?url=$encodedLink"
                else "https://t.me/share/url?url=$encodedLink&text=$enc"
            }
            else -> null
        }
    }

    /** Canonical public URL for a review. */
    fun reviewUrl(reviewId: String): String = "$CANONICAL_ORIGIN/reviews/$reviewId"

    /** The web Inbox — the only Tappy Messenger there is. Mobile opens it rather than cloning it. */
    const val INBOX_URL: String = "$CANONICAL_ORIGIN/profile/notifications?tab=messages"
}
