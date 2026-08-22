package com.tappyai.app.chat

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * U07 — a machine code must never be shown to a user as a chat message.
 *
 * ============================================================================
 * THE DEFECT
 * ============================================================================
 * `POST /api/chat` answers a malformed request with `{"error":"invalid_request"}` and no
 * `message`. The server does that deliberately — it treats a bad request shape as a client bug and
 * takes the view that there is no sentence worth showing the user.
 *
 * `RealChatRepository.parseChatError` then fell through to `dto.error`, and `ChatViewModel` renders
 * whatever it receives as an assistant bubble. The user was shown a chat message reading, in full,
 * `invalid_request` — untranslated, in both app languages.
 *
 * The classifier below is what stops that. It is tested directly rather than through the whole
 * repository because the repository needs OkHttp, Hilt and a live stream to construct, and none of
 * that is what went wrong.
 *
 * 🚨 It must stay PERMISSIVE. Several older routes really do put a human sentence in `error`, and
 * those messages are good ones — the rule is "reject what is unambiguously a code", not "accept
 * only what is provably prose".
 */
class ChatErrorMessageContractTest {

    /** Mirrors RealChatRepository.looksLikeSentence. */
    private fun looksLikeSentence(value: String): Boolean {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return false
        return !trimmed.matches(Regex("^[a-z0-9]+(_[a-z0-9]+)*$"))
    }

    @Test
    fun `machine codes are not treated as prose`() {
        // Every error code this API actually returns on the chat path.
        val codes = listOf(
            "invalid_request",
            "invalid_content",
            "invalid_role",
            "too_many_messages",
            "too_many_images",
            "message_too_long",
            "anon_limit_reached",
            "free_limit_reached",
            "rate_limit",
            "ai_error",
            "server_error",
            "forbidden_structure",
            "preference_budget_exceeded",
            "input_budget_exceeded",
            "image_too_large",
        )
        for (code in codes) {
            assertFalse("`$code` would be rendered to the user as a chat message", looksLikeSentence(code))
        }
    }

    @Test
    fun `real sentences still pass through`() {
        // Older routes put human text in `error`, and losing those would be a regression in the
        // opposite direction — a useful message replaced by a generic one.
        val sentences = listOf(
            "Bạn đã dùng hết 5 câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy!",
            "You've used all 5 free questions for today.",
            "Unauthorized",
            "Tên nhóm không hợp lệ",
            "Please sign in",
            "Something went wrong.",
        )
        for (s in sentences) {
            assertTrue("`$s` is a real message and must reach the user", looksLikeSentence(s))
        }
    }

    @Test
    fun `blank and whitespace are not prose`() {
        assertFalse(looksLikeSentence(""))
        assertFalse(looksLikeSentence("   "))
    }

    @Test
    fun `the repository uses the classifier rather than falling through to error`() {
        // The classifier is only useful if the call site consults it. This asserts the wiring, in
        // the file itself, because that is where the original bug lived.
        val src = java.io.File("src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt").readText()
        val code = src.replace(Regex("(?m)^\\s*//.*$"), "")
        assertTrue(
            "parseChatError no longer guards dto.error with looksLikeSentence",
            code.contains("dto?.error?.takeIf { looksLikeSentence(it) }"),
        )
        assertFalse(
            "the raw `dto?.message ?: dto?.error` fallback is back — a machine code can reach the UI",
            code.contains("dto?.message ?: dto?.error ?:"),
        )
    }
}
