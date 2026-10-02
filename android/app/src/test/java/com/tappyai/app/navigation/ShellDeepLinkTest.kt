package com.tappyai.app.navigation

import com.tappyai.app.home.HomeRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * P4-14 — a notification that names a destination INSIDE the shell opens it.
 *
 * The minimum-impact route was chosen deliberately. `HomeRoute` is documented as "a private
 * navigation space inside the post-auth shell, not app-wide routable destinations", and promoting
 * its tabs into the global `AppRoute` vocabulary to serve one entry point would dissolve that
 * boundary permanently. Instead the link maps to the shell route that already exists and the nested
 * destination is handed across in [PendingShellDestination] for the shell to consume itself.
 *
 * `HomeRoute.Chat` already carries a `conversationId`, so reaching a specific thread needs no new
 * vocabulary at all — only the handoff.
 */
class ShellDeepLinkTest {

    private val origin = "https://www.tappyai.com"
    private fun resolve(uri: String) = ShellDeepLink.destinationFor(uri, origin)

    @Test
    fun `a chat link opens that conversation, not just the chat tab`() {
        assertEquals(HomeRoute.Chat(conversationId = "c123"), resolve("$origin/chat/c123"))
    }

    @Test
    fun `query strings and trailing slashes do not defeat it`() {
        assertEquals(HomeRoute.Chat(conversationId = "c123"), resolve("$origin/chat/c123?from=push"))
        assertEquals(HomeRoute.Chat(conversationId = "c123"), resolve("$origin/chat/c123/"))
    }

    @Test
    fun `the host is matched case-insensitively`() {
        assertEquals(HomeRoute.Chat(conversationId = "c1"), resolve("https://WWW.TAPPYAI.COM/chat/c1"))
    }

    // ── A payload is untrusted input ────────────────────────────────────────

    @Test
    fun `a link to another origin is refused`() {
        assertNull(resolve("https://evil.example/chat/c123"))
        assertNull(resolve("https://www.tappyai.com.evil.example/chat/c123"))
    }

    @Test
    fun `a non-https scheme is refused`() {
        assertNull(resolve("http://www.tappyai.com/chat/c123"))
        assertNull(resolve("tappyai://chat/c123"))
    }

    @Test
    fun `a malformed link degrades to no destination rather than throwing`() {
        assertNull(resolve("not a uri at all"))
        assertNull(resolve(""))
    }

    // ── Only object-level destinations that exist are claimed ───────────────

    @Test
    fun `reviews and deals are deliberately not mapped`() {
        // Their TABS exist, but the object-level destinations live in each tab's own nested graph
        // and are not addressable from here. Landing the user on a generic tab would break the rule
        // the design states plainly — a notification lands on the specific object, never a tab — so
        // the app opens normally instead.
        assertNull(resolve("$origin/reviews/r1"))
        assertNull(resolve("$origin/deals/d1"))
    }

    @Test
    fun `a bare chat link with no conversation is not a destination`() {
        assertNull(resolve("$origin/chat"))
        assertNull(resolve("$origin/"))
    }

    @Test
    fun `a group link is left to the app-wide parser`() {
        // Two layers must not both claim the same link, or which one wins becomes an accident of
        // ordering. Groups have a real top-level route; this mapper declines them.
        assertNull(resolve("$origin/group/g1"))
    }
}

/**
 * The handoff itself: one value, taken exactly once.
 */
class PendingShellDestinationTest {

    @Test
    fun `a destination is delivered once and only once`() {
        val holder = PendingShellDestination()
        holder.set(HomeRoute.Chat(conversationId = "c1"))

        assertEquals(HomeRoute.Chat(conversationId = "c1"), holder.consume())
        // A tap is a one-shot event. Replaying it would yank a user who had since navigated away.
        assertNull("a consumed destination must not be delivered again", holder.consume())
    }

    @Test
    fun `nothing pending means nothing happens`() {
        assertNull(PendingShellDestination().consume())
    }

    @Test
    fun `a newer tap replaces an unconsumed older one`() {
        val holder = PendingShellDestination()
        holder.set(HomeRoute.Chat(conversationId = "old"))
        holder.set(HomeRoute.Chat(conversationId = "new"))
        assertEquals(HomeRoute.Chat(conversationId = "new"), holder.consume())
    }
}
