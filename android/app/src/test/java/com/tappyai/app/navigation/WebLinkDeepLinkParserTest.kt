package com.tappyai.app.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * P4-14 — a notification's https entity link resolves to the destination it names.
 *
 * The tap path was already complete: FCM → TappyNotificationClick → PendingIntent(ACTION_VIEW) →
 * MainActivity → AppNavHostViewModel.handleDeepLink → parsers. The only missing piece was that the
 * server sends the WEB url (`emitNotification` puts `entityUrl` into `data.url`) while the sole
 * non-auth parser accepted `tappyai://` and nothing else — so a tap opened the app on whatever
 * screen it was last on.
 *
 * The security-shaped assertions below matter most: a notification payload is data the app did not
 * write, so a link pointing at another origin must never become an in-app destination.
 */
class WebLinkDeepLinkParserTest {

    private val origin = "https://www.tappyai.com"
    private fun resolve(uri: String) = WebLinkDeepLinkParser.resolve(uri, origin)

    @Test
    fun `a group entity link resolves to the existing group route`() {
        assertEquals(AppRoute.GroupDetail("abc123"), resolve("$origin/group/abc123"))
    }

    @Test
    fun `query strings and trailing slashes do not defeat it`() {
        assertEquals(AppRoute.GroupDetail("abc123"), resolve("$origin/group/abc123?from=push"))
        assertEquals(AppRoute.GroupDetail("abc123"), resolve("$origin/group/abc123/"))
    }

    @Test
    fun `the host is matched case-insensitively`() {
        assertEquals(AppRoute.GroupDetail("x"), resolve("https://WWW.TAPPYAI.COM/group/x"))
    }

    // ── A payload is untrusted input ────────────────────────────────────────

    @Test
    fun `a link to another origin is refused`() {
        assertNull("a foreign origin must never become an in-app destination",
            resolve("https://evil.example/group/abc123"))
    }

    @Test
    fun `a lookalike host is refused`() {
        assertNull(resolve("https://www.tappyai.com.evil.example/group/abc123"))
        assertNull(resolve("https://tappyai.com.evil.example/group/abc123"))
    }

    @Test
    fun `a non-https scheme is refused`() {
        assertNull(resolve("http://www.tappyai.com/group/abc123"))
        // The custom scheme is GroupDeepLinkParser's job; this parser must not also claim it, or
        // the two would silently compete for the same link.
        assertNull(resolve("tappyai://group/abc123"))
    }

    @Test
    fun `a malformed link degrades to no destination rather than throwing`() {
        assertNull(resolve("not a uri at all"))
        assertNull(resolve(""))
        assertNull(resolve("https://"))
    }

    // ── Only paths with a real screen behind them are claimed ───────────────

    @Test
    fun `a path with no existing route is left alone`() {
        // Inventing a destination for a path with no screen would be worse than opening the app.
        assertNull(resolve("$origin/reviews/r1"))
        assertNull(resolve("$origin/deals/d1"))
        assertNull(resolve("$origin/chat/c1"))
    }

    @Test
    fun `a bare section link with no id is not a destination`() {
        assertNull(resolve("$origin/group"))
        assertNull(resolve("$origin/"))
        assertNull(resolve(origin))
    }
}
