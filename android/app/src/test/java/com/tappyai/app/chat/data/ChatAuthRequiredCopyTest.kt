package com.tappyai.app.chat.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * UAT-CHAT-001 — a visitor refused by the Chat product-access gate must read CHAT copy.
 *
 * Reproduced on Pixel_8 against production: "Quán bún bò ngon ở TP.HCM?" → `401` with
 * `{"error":"auth_required","message":"Hãy đăng nhập để đăng bài, bình luận và theo dõi."}`.
 * The sentence is `auth.accountRequired`, the SOCIAL catalogue entry the gate shares with every
 * write surface it protects, and the client rendered it verbatim — a chat user was told to sign
 * in to "post, comment and follow".
 *
 * The mapping is exercised directly: it is a pure function of status + decoded body, and the
 * repository around it needs OkHttp and Hilt to construct, none of which is what went wrong.
 */
class ChatAuthRequiredCopyTest {

    private val social = "Hãy đăng nhập để đăng bài, bình luận và theo dõi."
    private val socialEn = "Sign in to post, comment and follow."

    /** Resolves the few resources the mapping reads, in the app's Vietnamese wording. */
    private val strings = object : StringProvider {
        override fun get(resId: Int): String = when (resId) {
            R.string.chat_error_login_required -> "Đăng nhập để tiếp tục trò chuyện với Tappy nhé!"
            R.string.chat_error_message_too_long -> "Tin nhắn quá dài."
            R.string.chat_error_ai_service_down -> "Dịch vụ AI tạm thời gặp sự cố."
            else -> "res:$resId"
        }
        override fun get(resId: Int, vararg args: Any): String = when (resId) {
            R.string.chat_error_generic_with_code -> "Có lỗi xảy ra (mã ${args[0]})"
            else -> get(resId)
        }
    }

    private fun error(code: Int, error: String?, message: String?) =
        chatErrorFor(code, ChatErrorDto(error = error, message = message), strings)

    @Test
    fun `401 auth_required shows the Chat sign-in message, never the social one`() {
        val e = error(401, "auth_required", social)

        assertTrue(e is ChatException.AuthRequired)
        assertEquals("Đăng nhập để tiếp tục trò chuyện với Tappy nhé!", e.message)
        assertFalse("the social/community copy reached the chat bubble", e.message!!.contains("đăng bài"))
        assertFalse(e.message!!.contains("bình luận"))
    }

    @Test
    fun `the substitution does not depend on which sentence the server attached`() {
        // English locale, a different sentence, or no sentence at all — the code is the contract.
        for (attached in listOf(socialEn, "Please sign in", null, "")) {
            val e = error(401, "auth_required", attached)
            assertTrue(e is ChatException.AuthRequired)
            assertEquals("Đăng nhập để tiếp tục trò chuyện với Tappy nhé!", e.message)
        }
    }

    @Test
    fun `401 anon_limit_reached still shows the server's own Chat sentence`() {
        // Unchanged: the daily-quota sentence the server sends for this code is already Chat copy.
        val sentence = "Bạn đã dùng hết 5 câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!"
        val e = error(401, "anon_limit_reached", sentence)

        assertTrue(e is ChatException.AnonLimitReached)
        assertEquals(sentence, e.message)
    }

    @Test
    fun `other 401s keep their server sentence and stay a plain server error`() {
        // A 401 the client has no special state for is still shown as the server phrased it;
        // only `auth_required` is substituted.
        val e = error(401, "token_expired", "Phiên đăng nhập đã hết hạn.")

        assertTrue(e is ChatException.ServerError)
        assertEquals(401, (e as ChatException.ServerError).code)
        assertEquals("Phiên đăng nhập đã hết hạn.", e.message)
    }

    @Test
    fun `unrelated mappings are unchanged`() {
        assertTrue(error(429, "free_limit_reached", "Hết lượt.") is ChatException.DailyLimitReached)
        assertTrue(error(429, "rate_limit", "Chậm lại.") is ChatException.RateLimited)
        assertTrue(error(413, "message_too_long", null) is ChatException.MessageTooLong)
        assertTrue(error(502, "ai_error", null) is ChatException.AiError)
        // A machine code with no sentence still falls through to the localized generic message.
        val invalid = error(400, "invalid_request", null)
        assertTrue(invalid is ChatException.ServerError)
        assertEquals("Có lỗi xảy ra (mã 400)", invalid.message)
    }

    @Test
    fun `the Chat sign-in copy is a real, chat-specific sentence in both languages`() {
        // Read the resources as shipped: the string must exist in both locales, and neither may
        // be the social wording the bug showed.
        val base = java.io.File("src/main/res/values/strings_chat.xml").readText()
        val vi = java.io.File("src/main/res/values-vi/strings_chat.xml").readText()
        val re = Regex("""<string name="chat_error_login_required">([^<]+)</string>""")
        val en = re.find(base)?.groupValues?.get(1)
        val viText = re.find(vi)?.groupValues?.get(1)

        assertEquals("Sign in to keep chatting with Tappy.", en)
        assertEquals("Đăng nhập để tiếp tục trò chuyện với Tappy nhé!", viText)
        assertFalse(viText!!.contains("đăng bài"))
        assertFalse(en!!.contains("post, comment"))
    }
}
