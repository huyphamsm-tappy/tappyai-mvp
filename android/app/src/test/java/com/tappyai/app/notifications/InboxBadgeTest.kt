package com.tappyai.app.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The bell's unread badge (2026-09-17) — the web shell's `unreadCount` on `<Bell>`: a rose count
 * from `GET /api/notifications` → `unread_count`, "99+" past ninety-nine, nothing at zero,
 * signed-in only, re-read on every resume of a screen that draws a bell (Home, Explore).
 */
class InboxBadgeTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    @Test
    fun `the label is the web's - the count, capped at 99+`() {
        assertEquals("1", unreadBadgeLabel(1))
        assertEquals("99", unreadBadgeLabel(99))
        assertEquals("99+", unreadBadgeLabel(100))
        assertEquals("99+", unreadBadgeLabel(1_000))
    }

    @Test
    fun `the badge draws nothing at zero and the count comes from the Inbox route, signed-in only`() {
        val s = src("app/src/main/java/com/tappyai/app/notifications/InboxBadge.kt")
        assertTrue("nothing at zero", s.contains("if (count <= 0) return"))
        assertTrue("the same gate as the Inbox, Messages and the self profile", s.contains("if (userId == null || !selfProfileAccess(userId, anonymous)) {") && s.contains("val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }"))
        assertTrue("a guest draws nothing and requests nothing", s.substringAfter("!selfProfileAccess(userId, anonymous)) {").substringBefore("}").contains("unreadCount = 0"))
        assertTrue("GET /api/notifications → unread_count, the Inbox's own number", s.contains("repository.getNotifications()") && s.contains("unreadCount = result.data.unreadCount"))
        assertTrue("a transient failure keeps the previous count", s.contains("is NetworkResult.Error -> Unit"))
        assertFalse("no local persistence of a count", s.contains("SharedPreferences") || s.contains("DataStore"))
        assertTrue("web's rose", s.contains("Color(0xFFF43F5E)"))
    }

    @Test
    fun `both bells carry the badge and refresh it on resume - Home and Explore`() {
        val home = src("app/src/main/java/com/tappyai/app/home/HomeV3.kt")
        assertTrue(home.contains("unreadCount: Int = 0,") && home.contains("UnreadBadge(count = unreadCount)"))
        val shell = src("app/src/main/java/com/tappyai/app/home/HomeShellScreen.kt")
        assertTrue(shell.contains("val inboxBadge: InboxBadgeViewModel = hiltViewModel()") && shell.contains("inboxBadge.refresh()") && shell.contains("unreadCount = inboxBadge.unreadCount,"))
        val feed = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        val feedScreen = feed.substringAfter("internal fun ReviewsFeedScreen(").substringBefore("internal fun ProfileClipsScreen(")
        assertTrue(feedScreen.contains("inboxBadge: InboxBadgeViewModel = hiltViewModel()") && feedScreen.contains("inboxBadge.refresh()") && feedScreen.contains("unreadCount = inboxBadge.unreadCount,"))
        val bar = feed.substringAfter("private fun FeedTopBar(").substringBefore("private fun ExploreHeaderAction(")
        assertTrue(bar.contains("UnreadBadge(count = unreadCount)"))
        assertTrue("the Inbox's own unread count is the same field", src("app/src/main/java/com/tappyai/app/notifications/InboxViewModel.kt").contains("unreadCount = result.data.unreadCount"))
    }
}
