package com.tappyai.app.notifications

import com.tappyai.app.reviews.data.NotificationDto
import com.tappyai.app.reviews.data.NotificationsResponseDto
import com.tappyai.app.reviews.data.groupNotifications
import com.tappyai.app.reviews.data.toDomain
import androidx.compose.ui.graphics.toArgb
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.ZoneId

/**
 * The Inbox (web `/profile/notifications`, V3 Page 6) on Android, 2026-09-17.
 *
 * The first block is the reason the screen was rebuilt: the DTO decoded the pre-ADR shape while
 * `GET /api/notifications` has returned ADR-014 contract v1 since 2026-07-26, so with
 * `ignoreUnknownKeys` every row silently decoded to blanks. The fixture below is the v1 shape as
 * `src/app/api/notifications/route.ts` emits it; the assertions are what the web's
 * `mapDtoToInbox` + `groupNotifs` make of it.
 */
class InboxV3Test {

    private val json = Json { ignoreUnknownKeys = true }

    private val v1 = """
        {"notifications":[
          {"id":"n1","type":"like","category":"social","title":"Lan Nguyễn đã thích bài viết của bạn","body":"","actor":{"id":"u2","name":"Lan Nguyễn","avatar":"https://cdn/a.png"},"entity_url":"/reviews/r1","image_url":null,"data":{},"read_at":null,"created_at":"2026-09-17T09:00:00+07:00"},
          {"id":"n2","type":"like","category":"social","title":"Hùng Phạm đã thích bài viết của bạn","body":"","actor":{"id":"u3","name":"Hùng Phạm","avatar":null},"entity_url":"/reviews/r1","image_url":null,"data":{},"read_at":"2026-09-17T09:30:00+07:00","created_at":"2026-09-17T08:00:00+07:00"},
          {"id":"n3","type":"deal","category":"deal","title":"Shopee giảm 30%","body":"Đến hết Chủ nhật","actor":null,"entity_url":"/deals","image_url":null,"data":{},"read_at":"2026-09-16T10:00:00+07:00","created_at":"2026-09-16T09:00:00+07:00"},
          {"id":"n4","type":"system","category":"system","title":"Tappy vừa có bản cập nhật","body":"Xem gì mới","actor":null,"entity_url":null,"image_url":null,"data":{},"read_at":null,"created_at":"2026-09-15T09:00:00+07:00"}
        ],"unread_count":2}
    """.trimIndent()

    @Test
    fun `the DTO decodes the ADR-014 v1 contract - actor object, title and body, category, entity_url, read_at, unread_count`() {
        val page = json.decodeFromString<NotificationsResponseDto>(v1)
        assertEquals(2, page.unreadCount)
        val first = page.notifications[0]
        assertEquals("social", first.category)
        assertEquals("Lan Nguyễn đã thích bài viết của bạn", first.title)
        assertEquals("u2", first.actor?.id)
        assertEquals("https://cdn/a.png", first.actor?.avatar)
        assertEquals("/reviews/r1", first.entityUrl)
        assertNull(first.readAt)
        val deal = page.notifications[2]
        assertNull(deal.actor)
        assertEquals("Đến hết Chủ nhật", deal.body)
        assertEquals("2026-09-16T10:00:00+07:00", deal.readAt)
    }

    @Test
    fun `toDomain maps the v1 row the way the web's mapDtoToInbox does`() {
        val rows = json.decodeFromString<NotificationsResponseDto>(v1).notifications.map { it.toDomain() }
        assertEquals("Lan Nguyễn", rows[0].actorName)
        assertEquals("/reviews/r1", rows[0].url)
        assertEquals("", rows[2].actorId)
        assertEquals("", rows[3].url)
        assertEquals("Xem gì mới", rows[3].text)
        assertNull(rows[0].readAt)
    }

    @Test
    fun `grouping is the web's groupNotifs - likes on one review collapse, unread is ANY, non-social rows keep no actors`() {
        val groups = groupNotifications(json.decodeFromString<NotificationsResponseDto>(v1).notifications.map { it.toDomain() })
        assertEquals(3, groups.size)
        val likes = groups.first { it.type == "like" }
        assertEquals(2, likes.count)
        assertEquals(listOf("u2", "u3"), likes.actors.map { it.id })
        assertTrue("one unread like inside the stack makes the row unread", likes.unread)
        assertEquals("2026-09-17T09:00:00+07:00", likes.createdAt)
        assertTrue(likes.isSocial)
        val deal = groups.first { it.type == "deal" }
        assertTrue(deal.actors.isEmpty())
        assertFalse(deal.unread)
        assertFalse(deal.isSocial)
        val system = groups.first { it.type == "system" }
        assertTrue(system.unread)
        assertEquals("system", system.category)
    }

    @Test
    fun `the taxonomy is the web's CATEGORY_STYLE and NOTIF_COLOR, and an unknown category wears the system tint`() {
        assertEquals(0xFFFF6B35.toInt(), categoryStyle("social").color.toArgb())
        assertEquals("🏷️", categoryStyle("deal").emoji)
        assertEquals("✨", categoryStyle("explore").emoji)
        assertEquals(categoryStyle("system").emoji, categoryStyle("whatever").emoji)
        assertEquals(0xFF1D9E75.toInt(), notifTypeColor("follow").toArgb())
        assertEquals(0xFF378ADD.toInt(), notifTypeColor("comment").toArgb())
    }

    @Test
    fun `clockTime is the row's HH-mm in the given zone, blank on a malformed stamp`() {
        assertEquals("09:05", clockTime("2026-09-17T02:05:00Z", ZoneId.of("Asia/Ho_Chi_Minh")))
        assertEquals("", clockTime(""))
        assertEquals("", clockTime("yesterday"))
    }

    @Test
    fun `the filter is the four real categories plus All, and All is no filter`() {
        assertEquals(listOf(null, "social", "deal", "explore", "system"), InboxCategory.entries.map { it.apiValue })
    }

    // ── Source pins: the composition and the wiring ──

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    @Test
    fun `the screen is the V3 page - chips, unread pill, mark-all-read, settings, sectioned panels, dashed empties, sign-in gate`() {
        val s = src("app/src/main/java/com/tappyai/app/notifications/InboxScreen.kt")
        assertTrue(s.contains("V3PersonalPage(") && s.contains("R.string.inbox_v3_title") && s.contains("R.string.inbox_v3_subtitle"))
        assertTrue(s.contains("InboxCategory.entries.forEach") && s.contains("V3Chip("))
        assertTrue("the count, only when there is one", s.contains("if (viewModel.unreadCount > 0)") && s.contains("R.string.inbox_v3_unread"))
        assertTrue(s.contains("R.string.inbox_v3_mark_all_read") && s.contains("onClick = viewModel::markAllRead"))
        assertTrue(s.contains("Icons.Filled.Settings") && s.contains("onClick = onOpenSettings"))
        assertTrue(s.contains("NotificationSection.entries.forEach") && s.contains("notificationSection(it.createdAt, nowMillis)"))
        assertTrue(s.contains("V3EmptyPanel(text = stringResource(R.string.inbox_v3_empty_all)") && s.contains("R.string.inbox_v3_empty_filtered"))
        assertTrue("guests get the sign-in state, not a 401", s.contains("false -> SignedOutState(onSignIn)"))
        assertTrue("unread is quiet - a dot and a brighter title", s.contains("if (group.unread) HomeV3.Purple else Color.Transparent") && s.contains("if (group.unread) FontWeight.SemiBold else FontWeight.Medium"))
        assertTrue("the Tappy mark for system rows, the emoji for the rest", s.contains("if (category == \"system\")") && s.contains("R.drawable.tappy_wave"))
        assertTrue("+N is the collapsed count, never an unread badge", s.contains("if (group.count > 1)") && s.contains("R.string.inbox_v3_count_more"))
        assertTrue("the Messages tab (2026-09-17 second pass) with ITS OWN count, never the notification count", s.contains("messageUnread = messagesViewModel.unreadTotal") && s.contains("notificationUnread = viewModel.unreadCount") && s.contains("if (tab == 0) MessagesPane("))
    }

    @Test
    fun `one Inbox, three doors - Explore's bell, Home's bell via the Toi tab, and the same push-preference screen behind settings`() {
        val reviewsNav = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
        assertTrue(reviewsNav.contains("composable<ReviewsRoute.Notifications> {\n            InboxScreen("))
        assertTrue(reviewsNav.contains("onOpenSettings = { navController.navigate(ReviewsRoute.NotificationSettings) }"))
        assertTrue(reviewsNav.contains("composable<ReviewsRoute.NotificationSettings> {\n            NotificationsScreen("))
        val profileTab = src("app/src/main/java/com/tappyai/app/profile/ProfileTab.kt")
        assertTrue(profileTab.contains("composable<ProfileRoute.Inbox> {\n            InboxScreen("))
        assertTrue(profileTab.contains("onOpenSettings = { navController.navigate(ProfileRoute.Notifications) }"))
        assertTrue(profileTab.contains("navController.navigate(ProfileRoute.Inbox) { launchSingleTop = true }"))
        val shell = src("app/src/main/java/com/tappyai/app/home/HomeShellScreen.kt")
        assertTrue("Home's bell opens the Inbox, not merely the Tôi tab", shell.contains("onOpenNotifications = { inboxRequested = true; navController.selectTab(HomeTab.Profile) }"))
        assertTrue(shell.contains("openInboxRequest = inboxRequested"))
        assertFalse("the old black list and its static digest banner are gone", File(root(), "app/src/main/java/com/tappyai/app/reviews/ui/ReviewNotificationList.kt").exists())
        for (f in listOf("app/src/main/res/values/strings_reviews.xml", "app/src/main/res/values-vi/strings_reviews.xml")) {
            assertFalse(File(root(), f).readText().contains("reviews_notification_banner"))
        }
    }

    @Test
    fun `the write is the ADR-014 read route with no body - mark ALL - and it is optimistic with a reload on refusal`() {
        val api = src("app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt")
        assertTrue(api.contains("@POST(\"api/notifications/read\")\n    suspend fun markAllNotificationsRead(): MarkReadResponseDto"))
        val vm = src("app/src/main/java/com/tappyai/app/notifications/InboxViewModel.kt")
        assertTrue(vm.contains("groups = groups?.map { it.copy(unread = false) }") && vm.contains("unreadCount = 0"))
        assertTrue(vm.contains("groups = before; unreadCount = beforeCount"))
    }
}
