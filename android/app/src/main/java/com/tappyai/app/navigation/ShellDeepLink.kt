package com.tappyai.app.navigation

import com.tappyai.app.home.HomeRoute
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

/**
 * P4-14 — maps a notification's web link onto a destination **inside** the post-auth shell.
 *
 * WHY THIS IS NOT A SECOND ROUTING SYSTEM. [HomeRoute] is deliberately not a
 * [com.tappyai.core.navigation.TappyRoute]: it is "a private navigation space inside the post-auth
 * shell, not app-wide routable destinations", and the [com.tappyai.core.deeplink.DeepLinkParser]
 * chain can only produce app-wide routes. Rather than promote the shell's tabs into the global
 * vocabulary — which would dissolve that boundary for the sake of one entry point — this maps the
 * link to the shell route that already exists ([AppRoute.HomeShell]) and hands the nested
 * destination across in [PendingShellDestination] for the shell itself to consume.
 *
 * The shell keeps sole ownership of its own NavController and its own vocabulary. Nothing outside
 * it ever navigates it; it is simply told, once, where it was asked to open.
 *
 * WHAT IS DELIBERATELY NOT MAPPED. `/reviews/{id}` and `/deals/{id}` resolve to nothing. Their
 * tabs exist ([HomeRoute.Explore], [HomeRoute.Deals]) but the OBJECT-level destinations live in
 * each tab's own nested graph and are not addressable from here. Landing a user on a generic tab
 * would break the rule the design is explicit about — a notification "lands on the specific object,
 * never a generic tab" — so the app opens normally instead. That is a smaller lie than pretending
 * the tap took them somewhere.
 */
object ShellDeepLink {

    /**
     * The shell destination a link names, or null when it names none.
     *
     * Pure, with the origin passed in, so the rules are testable on the JVM — the app module has
     * no Robolectric and `android.net.Uri` returns defaults off-device.
     */
    @JvmStatic
    fun destinationFor(uri: String, webAppUrl: String): HomeRoute? {
        val parsed = runCatching { URI(uri) }.getOrNull() ?: return null
        if (!parsed.scheme.equals("https", ignoreCase = true)) return null

        // A notification payload is data the app did not write: a link at another origin must never
        // become an in-app destination.
        val expectedHost = runCatching { URI(webAppUrl).host }.getOrNull() ?: return null
        if (!parsed.host.equals(expectedHost, ignoreCase = true)) return null

        val segments = parsed.path.orEmpty().split('/').filter { it.isNotBlank() }
        if (segments.size < 2) return null

        return when (segments[0].lowercase()) {
            // `HomeRoute.Chat` already carries a conversationId — the destination exists in the
            // app's current navigation model, so no new vocabulary is needed to reach it.
            "chat" -> HomeRoute.Chat(conversationId = segments[1])
            else -> null
        }
    }
}

/**
 * A single shell destination waiting to be opened, handed from the deep-link layer to the shell.
 *
 * The smallest handoff that preserves the boundary: one nullable value, written once when a link
 * arrives and cleared by the shell the moment it acts on it. It is emphatically not a navigation
 * stack, a back stack, or a second source of truth about where the user is — outside of the instant
 * between a tap and the shell composing, it is null, and normal in-app navigation never touches it.
 *
 * `@Singleton` for the same reason [AppNavHostViewModel] is activity-scoped: a link tapped while
 * the app is not running is handled in `MainActivity.onCreate`, before the shell exists.
 */
@Singleton
class PendingShellDestination @Inject constructor() {
    @Volatile
    private var pending: HomeRoute? = null

    fun set(route: HomeRoute) {
        pending = route
    }

    /** Returns the pending destination and clears it, so a tap can never be replayed. */
    fun consume(): HomeRoute? {
        val current = pending
        pending = null
        return current
    }
}
