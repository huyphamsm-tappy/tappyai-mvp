package com.tappyai.app.navigation

import java.net.URI

/**
 * App Links (prepared) — which https links the app claims, decided from the URL string alone.
 *
 * The app claims exactly ONE public path family: `https://<web origin>/r/<slug>` — a public shared
 * result. It has no native screen for it (and must not invent one: the web page IS the acquisition
 * surface), so [com.tappyai.app.growth.PublicLinkOpener] shows that same page inside a Custom Tab
 * bound to a session, which is the documented way to keep the navigation in the tab instead of
 * bouncing back to this app (Chrome: "passing a CustomTabsSession to a CustomTabsIntent will force
 * open the link in a Custom Tab, even if the corresponding native app is installed").
 *
 * Pure and JVM-testable, like [WebLinkDeepLinkParser]. The slug rule mirrors the web's
 * `SLUG_RE` (`/^[A-Za-z0-9]{10}$/`, src/lib/share/slug.ts) so the two sides agree on what a
 * public result URL looks like. Anything else — another host, http, a path with no screen —
 * returns false and the app opens normally, exactly as before.
 *
 * 🔑 The intent-filter that makes the OS deliver these links is on an `activity-alias` that is
 * DISABLED unless the build sets `TAPPYAI_APP_LINKS_ENABLED=true` (see AndroidManifest.xml and
 * app/build.gradle.kts). Until the owner publishes the signing fingerprint to
 * `/.well-known/assetlinks.json` and enables the flag, nothing here runs.
 */
object PublicWebLinks {

    private val SLUG = Regex("^[A-Za-z0-9]{10}$")

    /** The slug of a public result link on our origin, or null. */
    @JvmStatic
    fun publicResultSlug(uri: String, webAppUrl: String): String? {
        val parsed = runCatching { URI(uri) }.getOrNull() ?: return null
        if (!parsed.scheme.equals("https", ignoreCase = true)) return null
        val expectedHost = runCatching { URI(webAppUrl).host }.getOrNull() ?: return null
        if (!parsed.host.equals(expectedHost, ignoreCase = true)) return null
        val segments = parsed.path.orEmpty().split('/').filter { it.isNotBlank() }
        if (segments.size != 2 || segments[0] != "r") return null
        return segments[1].takeIf { SLUG.matches(it) }
    }

    @JvmStatic
    fun isPublicResultLink(uri: String, webAppUrl: String): Boolean = publicResultSlug(uri, webAppUrl) != null
}
