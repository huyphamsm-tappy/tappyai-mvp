package com.tappyai.app.explore

import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.app.reviews.ui.askTappySubject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ✦ Hỏi Tappy on the Explore rail (reference "TappyAI — Immersive AI Discovery", 2026-09-13).
 *
 * The contract is the web's (`AskTappyButton.tsx`, reviews `feedShared.tsx`): open Chat with a
 * prefilled question about THIS clip — `/chat?q=` + `bridge.promptEntity`, subject = the review's
 * place — and let the real Chat send it. On Android that is the existing
 * `navigateToChatWithPrefill` (HomeRoute.Chat(prefill), auto-sent once by ChatViewModel), the
 * same bridge Home and Deals already ride. No new endpoint, no Android-only AI. The subject
 * follows the ACTIVE clip: the rail hands the pager's row to the callback, so clip A asks about
 * A and clip B about B.
 */
class AskTappyTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    @Test
    fun `the subject is the clip's place, or its caption when it has no place, or nothing`() {
        val withPlace = SEED_REVIEWS.first { it.placeName != "Chia sẻ" && it.placeName.isNotBlank() }
        assertEquals(withPlace.placeName.trim(), askTappySubject(withPlace))
        val shareOnly = withPlace.copy(placeName = "Chia sẻ", body = "Quán bún bò ngon bá cháy anh em ơi")
        assertEquals("Quán bún bò ngon bá cháy anh em ơi", askTappySubject(shareOnly))
        val long = shareOnly.copy(body = "a".repeat(200))
        assertEquals(81, askTappySubject(long)!!.length)
        assertTrue(askTappySubject(long)!!.endsWith("…"))
        assertNull(askTappySubject(shareOnly.copy(body = "   ")))
        assertNull(askTappySubject(shareOnly.copy(placeName = "", body = "")))
    }

    @Test
    fun `two clips give two different prompts - the subject follows the tapped row`() {
        val a = SEED_REVIEWS[0].copy(placeName = "Bún bò Huế Cô Ba", body = "x")
        val b = SEED_REVIEWS[1].copy(placeName = "Chia sẻ", body = "Mì lòng heo nóng hổi")
        assertEquals("Bún bò Huế Cô Ba", askTappySubject(a))
        assertEquals("Mì lòng heo nóng hổi", askTappySubject(b))
        val pager = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt")
        assertTrue("the rail hands the pager's own row up", pager.contains("onAskTappy = onAskTappy?.let { ask -> { ask(review) } },"))
    }

    @Test
    fun `the prompt is the web template and it rides the existing Chat-with-prefill bridge`() {
        val nav = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
        assertTrue(nav.contains("askTappySubject(review)?.let { subject ->"))
        assertTrue(nav.contains("ask(context.getString(R.string.reviews_ask_tappy_prefill, subject))"))
        assertTrue("the feed and the profile pager both get it", nav.contains("onAskTappy = askTappy,"))
        val vi = src("app/src/main/res/values-vi/strings_reviews.xml")
        val en = src("app/src/main/res/values/strings_reviews.xml")
        assertTrue("same words as the web's bridge.promptEntity", vi.contains("<string name=\"reviews_ask_tappy_prefill\">Cho mình biết thêm về %1\$s</string>"))
        assertTrue(en.contains("<string name=\"reviews_ask_tappy_prefill\">Tell me more about %1\$s</string>"))
        assertTrue(vi.contains(">Hỏi Tappy<"))
        val shell = src("app/src/main/java/com/tappyai/app/home/HomeShellScreen.kt")
        assertTrue(shell.contains("onAskTappy = { prefill -> navController.navigateToChatWithPrefill(prefill) },"))
        assertTrue("the bridge is the existing one: HomeRoute.Chat(prefill), auto-sent by ChatViewModel", shell.contains("navigate(HomeRoute.Chat(prefill = prefill))"))
        assertTrue(src("app/src/main/java/com/tappyai/app/chat/ChatViewModel.kt").contains("sendUserMessage(prefill)"))
        assertFalse("no Android-only AI endpoint", nav.contains("api/ask") || shell.contains("api/ask"))
    }
}
