package com.tappyai.app.navigation

import com.tappyai.app.home.HomeRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * G1-F — an inbound system share lands on the chat with the question prefilled, and nothing
 * else is ever claimed. The prompt rule mirrors the web's Web Share Target so the same shared
 * link produces the same question on both surfaces.
 */
class IncomingShareParserTest {

    private val SEND = IncomingShareParser.ACTION_SEND

    @Test
    fun `a shared URL with a subject asks about the link`() {
        val route = IncomingShareParser.parse(SEND, "text/plain", "https://shopee.vn/x", "Áo thun")
        assertEquals(HomeRoute.Chat(prefill = "Cho mình biết về: Áo thun\nhttps://shopee.vn/x"), route)
    }

    @Test
    fun `a bare URL asks about the link`() {
        assertEquals(
            HomeRoute.Chat(prefill = "Cho mình biết về link này: https://shopee.vn/x"),
            IncomingShareParser.parse(SEND, "text/plain", "https://shopee.vn/x", null),
        )
    }

    @Test
    fun `a URL buried in the text is recovered`() {
        val route = IncomingShareParser.parse(SEND, "text/plain", "Xem cái này https://www.tiktok.com/@a/video/1", null)
        assertTrue(route!!.prefill!!.contains("https://www.tiktok.com/@a/video/1"))
    }

    @Test
    fun `plain text is the question itself`() {
        assertEquals(HomeRoute.Chat(prefill = "Quán này có ngon không?"), IncomingShareParser.parse(SEND, "text/plain", "Quán này có ngon không?", null))
    }

    // ── What is NOT claimed ──────────────────────────────────────────────────

    @Test
    fun `only ACTION_SEND of a text type is claimed`() {
        assertNull(IncomingShareParser.parse("android.intent.action.VIEW", "text/plain", "x", null))
        assertNull(IncomingShareParser.parse(SEND, "image/jpeg", "x", null))
        assertNull(IncomingShareParser.parse(SEND, null, "x", null))
        assertNull(IncomingShareParser.parse(null, "text/plain", "x", null))
    }

    @Test
    fun `an empty share opens nothing rather than sending an empty question`() {
        assertNull(IncomingShareParser.parse(SEND, "text/plain", "   ", null))
        assertNull(IncomingShareParser.parse(SEND, "text/plain", null, null))
    }

    @Test
    fun `the prompt is capped and control characters are stripped`() {
        val prompt = IncomingShareParser.buildPrompt(null, "ab".repeat(2000))!!
        assertTrue(prompt.length <= 1000)
        assertTrue(!prompt.contains(''))
    }

    @Test
    fun `no route carries a conversation id or category — a share is always a fresh question`() {
        val route = IncomingShareParser.parse(SEND, "text/plain", "hi", null)!!
        assertNull(route.conversationId)
        assertNull(route.category)
    }
}
