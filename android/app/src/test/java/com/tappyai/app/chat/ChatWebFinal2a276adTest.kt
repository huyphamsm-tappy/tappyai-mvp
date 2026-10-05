package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChatErrorDto
import com.tappyai.app.chat.data.ChatException
import com.tappyai.app.chat.data.ChatStreamEvent
import com.tappyai.app.chat.data.ChatStreamFrames
import com.tappyai.app.chat.data.chatErrorFor
import com.tappyai.core.common.StringProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Web final = `2a276ad` (`feat(web): finalize phase 7 web baseline`, branch p7/web-subscription), checklist
 * `docs/audit/PHASE7-CLOSEOUT.md` §A. Against the Web that Android was last aligned to (`56a26ae`) its `/api/chat`
 * wire surface changed in exactly three places, each pinned here from the Web source:
 *
 *  - a new 429 error code `plan_limit_reached` (route.ts: a paid plan's own daily limit, next to `free_limit_reached`);
 *  - a new annotation kind `tappy.sponsored.v1` (agent/dataStream.ts `belowAnswerFrame`) — an extension point that is NOT
 *    emitted ("No provider exists in this release"), so a client has nothing to render and must ignore it;
 *  - the free tier is 10 questions a day (`FREE_DAILY_LIMIT = 10` in src/lib/config/product.ts, was 15), and the global AI
 *    disclaimer is rendered by the product under the chat composer (`ai.disclaimer`, CP7).
 * Request body, headers, markers, frames, session id: unchanged (the bounded agent writes the same data-stream protocol).
 */
class ChatWebFinal2a276adTest {

    private val strings = object : StringProvider {
        override fun get(resId: Int): String = "res$resId"
        override fun get(resId: Int, vararg args: Any): String = "res$resId:${args.joinToString(",")}"
    }

    private fun error(code: Int, error: String?, message: String?) = chatErrorFor(code, ChatErrorDto(error = error, message = message), strings)

    @Test
    fun `plan_limit_reached is a daily cap like free_limit_reached and keeps the server sentence`() {
        val e = error(429, "plan_limit_reached", "Bạn đã dùng hết 30 câu hỏi hôm nay của gói Momo.")
        assertTrue(e is ChatException.DailyLimitReached)
        assertEquals("Bạn đã dùng hết 30 câu hỏi hôm nay của gói Momo.", e.message)
        assertTrue(error(429, "free_limit_reached", "Hết lượt.") is ChatException.DailyLimitReached)
    }

    @Test
    fun `the other 429 codes keep their meaning`() {
        assertTrue(error(429, "rate_limit", "Chậm lại.") is ChatException.RateLimited)
        assertTrue(error(429, "pro_daily_limit_reached", "Hết lượt Pro.") is ChatException.RateLimited)
        assertTrue(error(429, "share_follow_up_limit", "Đủ rồi.") is ChatException.RateLimited)
        assertTrue("plan_limit_reached is only a 429", error(500, "plan_limit_reached", "x") is ChatException.ServerError)
    }

    @Test
    fun `the sponsored annotation is ignored - not emitted by Web, nothing to render`() {
        val line = """8:[{"kind":"tappy.sponsored.v1","items":[{"label":"x","url":"https://example.com","sponsor":"s"}]}]"""
        assertNull(ChatStreamFrames.parse(line))
        // …and next to a real place frame it does not hide it.
        val mixed = """8:[{"kind":"tappy.sponsored.v1","items":[]},{"kind":"tappy.progress.v1","stage":"found","text":"Đã tìm thấy 3 quán"}]"""
        assertTrue(ChatStreamFrames.parse(mixed) is ChatStreamEvent.Progress)
    }

    private fun res(rel: String): String {
        var dir: File? = File(System.getProperty("user.dir")!!).absoluteFile
        while (dir != null && !File(dir, "app/src/main").exists()) dir = dir.parentFile
        return File(dir!!, "app/src/main/$rel").readText()
    }

    @Test
    fun `the free tier says 10 a day, as Web FREE_DAILY_LIMIT`() {
        assertTrue(res("res/values-vi/strings_membership.xml").contains("<string name=\"membership_free_feature_messages\">10 tin nhắn / ngày</string>"))
        assertTrue(res("res/values/strings_membership.xml").contains("<string name=\"membership_free_feature_messages\">10 messages / day</string>"))
    }

    @Test
    fun `the AI disclaimer is Web's ai_disclaimer and is drawn under the composer`() {
        // src/lib/i18n/discovery.ts @ 2a276ad
        assertTrue(res("res/values-vi/strings_chat.xml").contains("<string name=\"chat_ai_disclaimer\">Tappy có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.</string>"))
        assertTrue(res("res/values/strings_chat.xml").contains("<string name=\"chat_ai_disclaimer\">Tappy can make mistakes. Please double-check important information.</string>"))
        val screen = res("java/com/tappyai/app/chat/ChatScreen.kt")
        val composer = screen.indexOf("        ChatComposer(")
        val disclaimer = screen.indexOf("R.string.chat_ai_disclaimer")
        assertTrue("the disclaimer sits right after the composer call", composer in 0 until disclaimer && disclaimer - composer < 1500)
    }
}
