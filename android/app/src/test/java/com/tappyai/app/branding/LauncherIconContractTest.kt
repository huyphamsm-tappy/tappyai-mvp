package com.tappyai.app.branding

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The installed app showed a white "T" on blue: the scaffold placeholder vector was never replaced.
 * Pins the launcher icon to the official TappyAI otter artwork (the same art as the Play Store icon,
 * android/store/icon-512.png) packaged as an adaptive icon, and keeps the status-bar glyph separate
 * because a colour PNG would render as a solid square there.
 */
class LauncherIconContractTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/AndroidManifest.xml").isFile }

    private fun res(rel: String) = File(root(), "app/src/main/res/$rel")

    private fun pngSize(f: File): Pair<Int, Int> {
        val b = f.readBytes()
        check(b.size > 24 && b[1] == 'P'.code.toByte()) { "not a PNG: $f" }
        fun int(o: Int) = ((b[o].toInt() and 255) shl 24) or ((b[o + 1].toInt() and 255) shl 16) or ((b[o + 2].toInt() and 255) shl 8) or (b[o + 3].toInt() and 255)
        return int(16) to int(20)
    }

    @Test
    fun `manifest points the app and round icon at the mipmaps`() {
        val m = File(root(), "app/src/main/AndroidManifest.xml").readText()
        assertTrue(m.contains("android:icon=\"@mipmap/ic_launcher\""))
        assertTrue(m.contains("android:roundIcon=\"@mipmap/ic_launcher_round\""))
    }

    @Test
    fun `both adaptive icons use the gradient background and the otter foreground`() {
        for (n in listOf("ic_launcher", "ic_launcher_round")) {
            val x = res("mipmap-anydpi-v26/$n.xml").readText()
            assertTrue(n, x.contains("<background android:drawable=\"@drawable/ic_launcher_background\" />"))
            assertTrue(n, x.contains("<foreground android:drawable=\"@drawable/ic_launcher_foreground\" />"))
        }
    }

    @Test
    fun `the foreground is the otter PNG on a 108dp canvas, not the old T vector`() {
        assertFalse("the placeholder vector must be gone", res("drawable/ic_launcher_foreground.xml").exists())
        val png = res("drawable-nodpi/ic_launcher_foreground.png")
        assertTrue(png.isFile)
        val (w, h) = pngSize(png)
        assertEquals(w, h)
        assertTrue("canvas must be at least xxxhdpi (432px) for 108dp", w >= 432)
        assertFalse("no colour resource may shadow the background drawable", res("values/ic_launcher_background.xml").exists())
    }

    @Test
    fun `the status bar keeps a monochrome vector, never the colour launcher art`() {
        assertTrue(res("drawable/ic_stat_notification.xml").readText().contains("<vector"))
        val src = File(root(), "app/src/main/java/com/tappyai/app/notifications/TappyNotificationPresenter.kt").readText()
        assertTrue(src.contains("setSmallIcon(R.drawable.ic_stat_notification)"))
        assertFalse(src.contains("ic_launcher_foreground"))
    }
}
