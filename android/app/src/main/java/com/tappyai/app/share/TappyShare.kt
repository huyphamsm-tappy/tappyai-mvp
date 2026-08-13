package com.tappyai.app.share

/**
 * The share targets, mirroring the web contract in `src/lib/share/shareTargets.ts`.
 *
 * Android already had a system share sheet, which is the right primitive but not
 * the whole experience: it surfaces whatever happens to be installed and gives
 * the user no explicit Facebook / TikTok / Zalo choice. This adds those targets
 * on top; the system sheet stays as "More apps".
 *
 * URL handoff only. TappyAI does not publish to any of these networks, so
 * nothing here may report that a post was made.
 */
object TappyShare {

    /** Canonical public origin. Must match NEXT_PUBLIC_SITE_URL on the web. */
    const val CANONICAL_ORIGIN: String = "https://www.tappyai.com"

    enum class Target(val id: String) {
        FACEBOOK("facebook"),
        TIKTOK("tiktok"),
        ZALO("zalo"),
        COPY("copy"),
        NATIVE("native"),
    }

    /** Display order, identical to web. */
    val targets: List<Target> = listOf(
        Target.FACEBOOK,
        Target.TIKTOK,
        Target.ZALO,
        Target.COPY,
        Target.NATIVE,
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
     * arbitrary link, and COPY/NATIVE are not handoffs. Callers copy the link
     * instead — never fabricate a URL, never claim a post happened.
     */
    fun buildShareUrl(target: Target, canonicalUrl: String): String? {
        if (!isShareableUrl(canonicalUrl)) return null
        val encoded = java.net.URLEncoder.encode(canonicalUrl, "UTF-8")
        return when (target) {
            Target.FACEBOOK -> "https://www.facebook.com/sharer/sharer.php?u=$encoded"
            Target.ZALO -> "https://sp.zalo.me/plugins/share?url=$encoded"
            Target.TIKTOK, Target.COPY, Target.NATIVE -> null
        }
    }

    /** Canonical public URL for a review. */
    fun reviewUrl(reviewId: String): String = "$CANONICAL_ORIGIN/reviews/$reviewId"
}
