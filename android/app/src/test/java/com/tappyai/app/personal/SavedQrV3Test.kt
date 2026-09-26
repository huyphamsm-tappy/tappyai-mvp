package com.tappyai.app.personal

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Saved (web `/profile/favorites`, `SavedView.tsx`) and QR Profile (web `/profile/qr`,
 * `QRProfileView.tsx`) on Android — the two V3 web surfaces the 2026-09-17 parity audit found
 * still on their pre-V3 composition. Source pins of the product contract; the data paths are
 * unchanged and covered by their own tests.
 */
class SavedQrV3Test {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    @Test
    fun `Saved is the V3 hub - two REAL categories with counts, zero shown not hidden, a category view with a back link and the dashed empty`() {
        val s = src("app/src/main/java/com/tappyai/app/saved/SavedScreen.kt")
        assertTrue(s.contains("V3PersonalPage(") && s.contains("R.string.saved_title") && s.contains("R.string.saved_items_count"))
        assertTrue("the hub's two rows are the two lists that open", s.contains("HubRow(key = \"places\"") && s.contains("HubRow(key = \"posts\""))
        assertFalse("no Deals / Sản phẩm / Video rows - nothing saves those", s.contains("\"deals\"") || s.contains("\"products\"") || s.contains("\"video\""))
        assertTrue("zero is shown, not hidden", s.contains("UiState.Empty -> SavedData(emptyList(), emptyList())"))
        assertTrue("the category view unwinds with the system Back too", s.contains("BackHandler(enabled = view != null) { view = null }"))
        assertTrue(s.contains("R.string.saved_empty_title") && s.contains("R.string.saved_explore_now") && s.contains("onClick = onExploreNow"))
        assertTrue("un-saving still goes through the same route", s.contains("viewModel.removeFavorite(fav.placeId)"))
        assertTrue(s.contains("onOpenPlace(fav)") && s.contains("onOpenReview(review.id)"))
    }

    @Test
    fun `QR Profile is the V3 panel - plain code on a white card, the stored name, share, download to Pictures, the save hint`() {
        val s = src("app/src/main/java/com/tappyai/app/profile/QrProfileSheet.kt")
        assertTrue(s.contains("V3HomeTheme {") && s.contains("R.string.profile_qr_title"))
        assertTrue("the code is plain black on white with the spec's quiet zone", s.contains("EncodeHintType.MARGIN to QR_MARGIN") && s.contains("private const val QR_MARGIN = 4") && s.contains("Color.BLACK else Color.WHITE"))
        assertTrue("the public profile URL and nothing else", s.contains("\"\${BuildConfig.WEB_APP_URL}/users/\$userId\""))
        assertTrue(s.contains("R.string.profile_qr_share_button") && s.contains("R.string.profile_qr_download_button") && s.contains("R.string.profile_qr_save_hint"))
        assertTrue("download = MediaStore, no legacy storage permission", s.contains("MediaStore.Images.Media.RELATIVE_PATH, \"Pictures/TappyAI\"") && s.contains("Build.VERSION_CODES.Q"))
        val profile = src("app/src/main/java/com/tappyai/app/profile/ProfileScreen.kt")
        assertTrue("the name as stored", profile.contains("QrProfileSheet(userId = userId, name = viewModel.profile?.fullName"))
        val vi = File(root(), "app/src/main/res/values-vi/strings_settings.xml").readText()
        assertTrue(vi.contains("<string name=\"profile_qr_scan_subtitle\">Quét mã QR để xem hồ sơ TappyAI của tôi</string>"))
        assertTrue(vi.contains("<string name=\"profile_qr_title\">Chia sẻ hồ sơ</string>"))
    }
}
