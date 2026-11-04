package com.tappyai.app.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Web final `a43948d` `ProfileRows.tsx` (owner 2026-10-02): "The COMPACT account group shown on the /profile hub: one row, like the Settings group.
 * It opens /profile/account, which lists the other eight rows of `accountRows()` (same order, names, icons) via `accountMoreRows()`", panel title
 * `profile.account.moreTitle` («Của tôi» / «Mine»), the compact row's blurb `profile.account.compactDesc` (`w2/profile.ts`). The Android hub listed all nine.
 */
class ProfileCompactHubParityTest {

    private fun file(rel: String): String {
        var dir: File? = File(System.getProperty("user.dir")!!).absoluteFile
        while (dir != null && !File(dir, "app/src/main").exists()) dir = dir.parentFile
        return File(dir!!, rel).readText()
    }

    @Test
    fun `the hub shows the one Account row and the Account page gets the other eight, in the Web order`() {
        assertEquals(listOf("Account"), accountHubMenuItems().map { it.name })
        assertEquals(
            listOf("ChatHistory", "Bookings", "Preferences", "Saved", "PriceTracking", "Planner", "TappyKnows", "GroupDining"),
            accountMoreMenuItems().map { it.name },
        )
        assertEquals("together they are Web's accountRows()", accountMenuItems().map { it.name }, (accountHubMenuItems() + accountMoreMenuItems()).map { it.name })
    }

    @Test
    fun `the compact blurb and the group title are the Web strings in both languages`() {
        val vi = file("app/src/main/res/values-vi/strings_settings.xml")
        val en = file("app/src/main/res/values/strings_settings.xml")
        assertTrue(vi.contains("<string name=\"profile_menu_account_compact_desc\">Hồ sơ, lịch sử chat, đặt chỗ, đã lưu, sở thích…</string>"))
        assertTrue(vi.contains("<string name=\"account_more_section\">Của tôi</string>"))
        assertTrue(en.contains("<string name=\"profile_menu_account_compact_desc\">Profile, chat history, bookings, saved, preferences…</string>"))
        assertTrue(en.contains("<string name=\"account_more_section\">Mine</string>"))
    }

    @Test
    fun `settings copy is the Web final dictionary in both languages`() {
        val vi = file("app/src/main/res/values-vi/strings_settings.xml")
        val en = file("app/src/main/res/values/strings_settings.xml")
        assertTrue(vi.contains("<string name=\"settings_notifications_desc\">Nhắc nhở và cập nhật</string>"))
        assertTrue(vi.contains("<string name=\"settings_memory\">Trí nhớ</string>"))
        assertTrue(vi.contains("<string name=\"settings_memory_desc\">Quản lý thông tin AI ghi nhớ</string>"))
        assertTrue(en.contains("<string name=\"settings_notifications_desc\">Reminders and updates</string>"))
        assertTrue(en.contains("<string name=\"settings_memory_desc\">Manage what the AI remembers</string>"))
    }

    @Test
    fun `the hub loop uses the compact list, the Account page renders the group and every row still has its destination`() {
        val screen = file("app/src/main/java/com/tappyai/app/profile/ProfileScreen.kt")
        assertTrue(screen.contains("accountHubMenuItems().forEachIndexed { index, item ->"))
        val tab = file("app/src/main/java/com/tappyai/app/profile/ProfileTab.kt")
        for (route in listOf("ChatHistory", "Bookings", "Preferences", "Saved", "PriceTracking", "Planner", "TappyKnows", "GroupDining")) {
            assertTrue("$route is reachable from the Account page", tab.contains("ProfileMenuItem.$route -> navController.navigate(ProfileRoute.$route)"))
        }
        assertTrue(file("app/src/main/java/com/tappyai/app/account/AccountScreen.kt").contains("moreRows()"))
    }
}
