package com.tappyai.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Pins the one-owner rule for the IME inset.
 *
 * REGRESSION (permanent): with no `android:windowSoftInputMode` declared, MainActivity resolved to
 * ADJUST_PAN on a real device (Samsung SM-A127F, Android 12 — measured `sim={adjust=pan}` in
 * `dumpsys window`). The system then panned the whole window up by the IME height while
 * ChatScreen's `imePadding()` subtracted that same height again, so the composer moved 1093px
 * instead of 672px and ended up at the TOP of the screen (EditText bounds went from
 * `[15,1242][411,1349]` to `[15,149][411,256]` for a 672px IME).
 *
 * The inset must have exactly ONE owner. `enableEdgeToEdge()` hands ownership to Compose, so the
 * window must not also pan — which is what `adjustResize` guarantees. These two facts are only
 * correct together, and they live in two different files, so neither one alone can be reviewed for
 * correctness. That is precisely why this is pinned rather than left to inspection.
 */
class ImeInsetContractTest {

    private val manifest = File("src/main/AndroidManifest.xml")
    private val mainActivity = File("src/main/java/com/tappyai/app/MainActivity.kt")
    private val chatScreen = File("src/main/java/com/tappyai/app/chat/ChatScreen.kt")

    /** The activity block, so an attribute on some other activity cannot satisfy the assertions. */
    private fun mainActivityBlock(): String {
        val text = manifest.readText()
        val start = text.indexOf("""android:name=".MainActivity"""")
        assertTrue("MainActivity not found in the manifest", start > 0)
        // Back up to the opening tag, then take everything up to the end of the opening tag.
        val tagStart = text.lastIndexOf("<activity", start)
        return text.substring(tagStart, text.indexOf('>', start))
    }

    @Test
    fun `MainActivity declares adjustResize`() {
        assertTrue(
            "MainActivity must declare android:windowSoftInputMode=\"adjustResize\" — without it " +
                "the mode resolves to ADJUST_PAN and the IME inset gets applied twice",
            mainActivityBlock().contains("""android:windowSoftInputMode="adjustResize""""),
        )
    }

    /** adjustPan here would restore the double-displacement exactly. */
    @Test
    fun `MainActivity does not pan for the IME`() {
        assertFalse(
            "adjustPan re-introduces the double inset: the system pans AND imePadding() pads",
            mainActivityBlock().contains("adjustPan"),
        )
    }

    /**
     * The other half of the contract. If edge-to-edge were ever dropped, the window would fit the
     * decor again and `imePadding()` would become the second subtraction rather than the only one.
     */
    @Test
    fun `edge-to-edge is what makes Compose the inset owner`() {
        assertTrue(
            "MainActivity must call enableEdgeToEdge() for imePadding() to be the sole IME owner",
            mainActivity.readText().contains("enableEdgeToEdge()"),
        )
    }

    /** And Compose must actually apply the inset it now owns, or the composer sits under the IME. */
    @Test
    fun `the chat composer applies the IME inset`() {
        assertTrue(
            "ChatScreen must keep imePadding() — it is the only thing lifting the composer now",
            chatScreen.readText().contains(".imePadding()"),
        )
    }
}
