package com.tappyai.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * TikTok takes a FILE (owner requirement, UAT 2026-09-28): ACTION_SEND with the image/video via the
 * FileProvider, aimed at com.zhiliaoapp.musically, then com.ss.android.ugc.trill, else the chooser.
 */
class TikTokHandoffTest {

    @Test
    fun `global TikTok first`() {
        val plan = TikTokHandoff.plan({ true }, hasFile = true, mimeType = "image/png")
        assertEquals(TikTokHandoff.Plan.ToApp("com.zhiliaoapp.musically", "image/png"), plan)
    }

    @Test
    fun `the Asia build when only it is installed`() {
        val plan = TikTokHandoff.plan({ it == "com.ss.android.ugc.trill" }, hasFile = true, mimeType = "video/mp4")
        assertEquals(TikTokHandoff.Plan.ToApp("com.ss.android.ugc.trill", "video/mp4"), plan)
    }

    @Test
    fun `no TikTok installed - the system chooser with the same file`() {
        assertEquals(TikTokHandoff.Plan.Chooser("image/png"), TikTokHandoff.plan({ false }, hasFile = true, mimeType = "image/png"))
    }

    @Test
    fun `no file - copy the caption, never an empty send`() {
        assertEquals(TikTokHandoff.Plan.CopyCaption, TikTokHandoff.plan({ true }, hasFile = false, mimeType = "image/png"))
    }

    @Test
    fun `caption is title then link`() {
        assertEquals("Phở Hòa\nhttps://www.tappyai.com/plan/abc", TikTokHandoff.caption("Phở Hòa", "https://www.tappyai.com/plan/abc"))
        assertEquals("https://a", TikTokHandoff.caption("", "https://a"))
    }

    /** The sheet's TikTok tile goes through toTikTok with a file — never the old copy-only path. */
    @Test
    fun `the sheet sends TikTok a file through ShareDelivery_toTikTok`() {
        val sheet = File("src/main/java/com/tappyai/app/share/TappyShareSheet.kt").readText()
        val branch = sheet.substringAfter("TappyShare.Target.TIKTOK -> {").substringBefore("TappyShare.Target.EMAIL")
        assertTrue(branch.contains("ShareDelivery.toTikTok("))
        // Not drawn yet → "preparing", never a false "not installed" + clipboard (review 2026-09-28).
        assertTrue(branch.contains("if (bitmap == null) { toast(context.getString(R.string.share_image_preparing)); return }"))
        val delivery = File("src/main/java/com/tappyai/app/share/ShareDelivery.kt").readText()
        val body = delivery.substringAfter("fun toTikTok(").substringBefore("fun toEmail(")
        for (needle in listOf("Intent.ACTION_SEND", "Intent.EXTRA_STREAM", "FLAG_GRANT_READ_URI_PERMISSION", "setPackage(plan.pkg)", "Intent.createChooser")) {
            assertTrue(needle, body.contains(needle))
        }
    }

    @Test
    fun `the UAT build's own subdomain is shareable, other subdomains are not`() {
        assertTrue(TappyShare.isShareableUrl("https://uat.tappyai.com/reviews/x", configuredOrigin = "https://uat.tappyai.com"))
        assertFalse(TappyShare.isShareableUrl("https://staging.tappyai.com/reviews/x", configuredOrigin = "https://uat.tappyai.com"))
        assertFalse(TappyShare.isShareableUrl("https://uat.tappyai.com/reviews/x", configuredOrigin = "https://www.tappyai.com"))
        assertTrue(TappyShare.isShareableUrl("https://www.tappyai.com/reviews/x", configuredOrigin = "https://uat.tappyai.com"))
    }
}
