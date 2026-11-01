package com.tappyai.app.chat.data

import com.tappyai.app.chat.partialReplyMessage
import com.tappyai.core.common.StringProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A6 (02/11): the one-brain route's refusals and a reply that stops half-way (web branch f4b07d2).
 *  - 429 `deep_research_limit_reached` is a limit of the plan (the server's own sentence names it), not the per-minute rate limiter;
 *    403 `ai_consent_required` shows the server's sentence.
 *  - What already arrived is kept (web useChat keeps the streamed text): Stop keeps it as the reply; an error after text keeps it, marked
 *    `interrupted` (the web's line), instead of replacing it with an error bubble.
 */
class ChatOneBrainErrorsTest {

    private val strings = object : StringProvider {
        override fun get(resId: Int): String = "res:$resId"
        override fun get(resId: Int, vararg args: Any): String = "res:$resId(${args.joinToString()})"
    }
    private fun error(code: Int, error: String?, message: String?) = chatErrorFor(code, ChatErrorDto(error = error, message = message), strings)

    @Test fun `the plan's limits are limits, with the server's sentence`() {
        val dr = error(429, "deep_research_limit_reached", "Bạn đã dùng hết 10 lượt Nghiên cứu sâu tháng này.")
        assertTrue(dr is ChatException.DailyLimitReached)
        assertEquals("Bạn đã dùng hết 10 lượt Nghiên cứu sâu tháng này.", dr.message)
        // the per-minute limiter and the hidden anti-abuse ceiling stay rate limits (ChatWebFinal2a276adTest)
        assertTrue(error(429, "rate_limit", "Chậm lại một chút nhé.") is ChatException.RateLimited)
    }

    @Test fun `ai_consent_required shows the server's sentence`() {
        val e = error(403, "ai_consent_required", "Bạn cần đồng ý cho Tappy dùng dữ liệu với AI.")
        assertEquals("Bạn cần đồng ý cho Tappy dùng dữ liệu với AI.", e.message)
    }

    @Test fun `a stopped reply keeps what arrived, an interrupted one says so`() {
        val stopped = partialReplyMessage(7, "## Kết quả\n\nPhần đầu [FOLLOWUPS]", interrupted = false)!!
        assertEquals(7L, stopped.id)
        assertTrue(stopped.text.startsWith("## Kết quả"))
        assertTrue("no marker reaches the reader", "[FOLLOWUPS]" !in stopped.text)
        assertNull(stopped.turnStatus)
        assertEquals("interrupted", partialReplyMessage(8, "Phần đầu", interrupted = true)!!.turnStatus)
        assertNull("nothing arrived, nothing kept", partialReplyMessage(9, "  \n", interrupted = true))
    }

    @Test fun `the ViewModel keeps the partial reply on Stop and on an error after text`() {
        val vm = File("src/main/java/com/tappyai/app/chat/ChatViewModel.kt").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(vm.contains("partialReplyMessage(nextId++, partial, interrupted = false)"))
        assertTrue(vm.contains("partialReplyMessage(nextId++, reply.toString(), interrupted = true)"))
    }
}
