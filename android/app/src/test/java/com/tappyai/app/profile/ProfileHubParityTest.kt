package com.tappyai.app.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity 2026-09-28: the "Tôi" hub lists exactly the web `accountRows()` / `settingsRows()`
 * (src/app/(app)/profile/ProfileRows.tsx) — which is also the D:\redesign "Tài khoản & Cài đặt"
 * mockup, row for row. Android had three extra rows (Social, App connections, My reviews) and a
 * privacy card that neither the web nor the mockup has; a guest could open rows the web locks.
 */
class ProfileHubParityTest {

    private val res = File("src/main/res")

    private fun strings(dir: String): Map<String, String> =
        res.resolve(dir).listFiles { f -> f.name.startsWith("strings") }!!.flatMap { f ->
            Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""").findAll(f.readText()).map { it.groupValues[1] to it.groupValues[2] }
        }.toMap()

    @Test
    fun `account rows are the web rows in the web order`() {
        assertEquals(
            listOf("Account", "ChatHistory", "Bookings", "Preferences", "Saved", "PriceTracking", "Planner", "TappyKnows", "GroupDining"),
            accountMenuItems().map { it.name },
        )
    }

    @Test
    fun `row labels are the web labels`() {
        val vi = strings("values-vi")
        val expected = mapOf(
            "profile_menu_account" to "Tài khoản",
            "profile_menu_account_desc" to "Thông tin cá nhân",
            "profile_menu_chat_history" to "Lịch sử chat",
            "profile_menu_chat_history_desc" to "Xem các cuộc trò chuyện trước đây",
            "profile_menu_bookings" to "Lịch đặt chỗ",
            "profile_menu_bookings_desc" to "Nhà hàng, spa, khách sạn đã đặt",
            "profile_menu_preferences" to "Sở thích của tôi",
            "profile_menu_preferences_desc" to "Ngân sách, ẩm thực yêu thích, kiêng cữ",
            "profile_menu_saved" to "Đã lưu",
            "profile_menu_saved_desc" to "Địa điểm yêu thích &amp; bài viết đã lưu",
            "profile_menu_price_tracking" to "Theo dõi giá",
            "profile_menu_price_tracking_desc" to "Tappy báo khi giá xuống mức mong muốn",
            "profile_menu_tappy_knows" to "Tappy biết gì về bạn",
            "profile_menu_tappy_knows_desc" to "Xem và quản lý bộ nhớ cá nhân của Tappy",
            "profile_menu_group_dining" to "Đi nhóm",
            "profile_menu_group_dining_desc" to "Cả team đi ăn gì? Để Tappy gợi ý",
            "profile_guest_title" to "Bạn đang dùng thử",
            "profile_guest_sign_in" to "Đăng nhập để lưu lại",
            "profile_guest_locked" to "Cần đăng nhập",
        )
        for ((k, v) in expected) assertEquals(k, v, vi[k])
    }

    @Test
    fun `content tabs are the web's six, in order - no Liked tab`() {
        // web ProfileView TABS: published, shared, saved, restricted, hidden, places.
        assertEquals(listOf("Posts", "Shared", "Saved", "Restricted", "Hidden", "Places"), HUB_CONTENT_TABS.map { it.name })
    }

    @Test
    fun `no privacy card and guest rows are locked behind sign-in`() {
        val src = File("src/main/java/com/tappyai/app/profile/ProfileScreen.kt").readText()
        assertFalse("privacy card is not on the web or the mockup", src.contains("PrivacyCard("))
        assertTrue("guest rows show the locked state", src.contains("R.string.profile_guest_locked"))
        assertTrue("a guest row sends the guest to sign in", src.contains("if (locked) onSignIn else"))
    }
}
