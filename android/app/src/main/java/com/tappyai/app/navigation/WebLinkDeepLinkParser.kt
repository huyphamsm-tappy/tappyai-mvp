package com.tappyai.app.navigation

import com.tappyai.app.BuildConfig
import com.tappyai.core.deeplink.DeepLinkParser
import com.tappyai.core.navigation.TappyRoute
import java.net.URI
import javax.inject.Inject

/**
 * P4-14 — resolves the **https** entity link a notification carries into an app destination.
 *
 * WHY THIS EXISTS. The whole notification-tap path was already built and wired: FCM →
 * [com.tappyai.app.notifications.TappyNotificationClick] → a PendingIntent with `ACTION_VIEW` on
 * the payload link → MainActivity → `AppNavHostViewModel.handleDeepLink` → the parser chain. What
 * was missing was one link at the end of it. The server sends `data.url` as the **web** entity URL
 * (`emitNotification` sets it from `entityUrl`), and the only non-auth parser in the chain,
 * [GroupDeepLinkParser], accepts the custom scheme `tappyai://group/{id}` and nothing else. So an
 * https notification link matched no parser, resolved to no destination, and a tap just opened the
 * app on whatever screen it was last on.
 *
 * This is therefore an ADAPTER, not a new navigation architecture: it introduces no route type,
 * changes no destination vocabulary, and touches nothing about delivery, consent or push identity.
 * It maps a URL shape the backend already emits onto a route that already exists.
 *
 * 🔑 THIS IS NOT APP LINKS. [GroupDeepLinkParser] notes that making an https link open the app
 * *from outside* needs domain verification (owner-side `assetlinks.json`), which remains out of
 * scope. That is a different problem: here the app already holds the URL string, handed to it in
 * its own notification payload, so it can read it without the OS routing anything.
 *
 * Only paths with an existing route are claimed. Everything else returns null and the app opens
 * normally — deliberately, because inventing a destination for a path with no screen behind it
 * would be worse than the current behaviour.
 */
class WebLinkDeepLinkParser @Inject constructor() : DeepLinkParser {

    override fun parse(uri: String): TappyRoute? = resolve(uri, BuildConfig.WEB_APP_URL)

    companion object {
        /**
         * The parse itself, with the origin passed in.
         *
         * Separate from [parse] so the rules are unit-testable without a build config — the same
         * split the comparison derivation uses, and for the same reason: the interesting part is
         * the decision, not where the constant came from.
         */
        @JvmStatic
        fun resolve(uri: String, webAppUrl: String): TappyRoute? {
            // `java.net.URI`, not `android.net.Uri`, so these rules can be tested on the JVM. The
            // app module has no Robolectric, and the framework Uri returns defaults off-device —
            // a test written against it would pass while asserting nothing.
            val parsed = runCatching { URI(uri) }.getOrNull() ?: return null
            if (!parsed.scheme.equals("https", ignoreCase = true)) return null

            // Host must be OUR origin. A notification payload is data the app did not write, so a
            // link pointing somewhere else must never become an in-app destination.
            val expectedHost = runCatching { URI(webAppUrl).host }.getOrNull() ?: return null
            if (!parsed.host.equals(expectedHost, ignoreCase = true)) return null

            val segments = parsed.path.orEmpty().split('/').filter { it.isNotBlank() }
            if (segments.size < 2) return null

            return when (segments[0].lowercase()) {
                // The one web path with an existing top-level route.
                "group" -> AppRoute.GroupDetail(segments[1])
                else -> null
            }
        }
    }
}
