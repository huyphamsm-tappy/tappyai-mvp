package com.tappyai.app.chat.data

import com.tappyai.app.history.data.CreateConversationRequestDto
import com.tappyai.app.history.data.StoredMessageDto
import com.tappyai.app.history.data.UpdateConversationRequestDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the JSON Android sends to `/api/conversations` and `/api/message-feedback` against the exact
 * bodies the web sends, since both backends read their fields positionally-by-name and a silent
 * rename would fail only at runtime, against production data, as a 400/500 the user never sees
 * (both calls are deliberately best-effort and swallow failures).
 *
 * The web's bodies, verbatim from source:
 *  - `src/app/chat/page.tsx`               → `JSON.stringify({ title, category, messages })`
 *  - `src/app/chat/[id]/ChatConversation.tsx` → `JSON.stringify({ id, title, messages })`
 *  - `src/components/chat/MessageActionBar.tsx` → `JSON.stringify({ conversationId, messageIndex, type, reason })`
 *    and, for DELETE, `{ conversationId, messageIndex, type }`
 *
 * [json] mirrors core:network's real configuration for the flags that affect *encoding*.
 * `encodeDefaults` is left at its default (false) exactly as the production instance does — that is
 * what keeps a null `reason` off the wire for like/dislike, matching the web sending `undefined`
 * (which `JSON.stringify` drops).
 */
class ChatWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `create conversation body matches the web POST shape`() {
        val body = CreateConversationRequestDto(
            title = "Xin chào",
            category = "food",
            messages = listOf(
                StoredMessageDto(role = "user", content = "Xin chào"),
                StoredMessageDto(role = "assistant", content = "Chào bạn!"),
            ),
        )

        assertEquals(
            """{"title":"Xin chào","category":"food","messages":[{"role":"user","content":"Xin chào"},{"role":"assistant","content":"Chào bạn!"}]}""",
            json.encodeToString(body),
        )
    }

    @Test
    fun `update conversation body matches the web PUT shape`() {
        val body = UpdateConversationRequestDto(
            id = "abc-123",
            title = "Xin chào",
            messages = listOf(StoredMessageDto(role = "user", content = "Xin chào")),
        )

        assertEquals(
            """{"id":"abc-123","title":"Xin chào","messages":[{"role":"user","content":"Xin chào"}]}""",
            json.encodeToString(body),
        )
    }

    /** Like/dislike send no `reason` — the web passes `undefined`, which `JSON.stringify` omits. */
    @Test
    fun `like feedback body omits reason`() {
        val body = SaveFeedbackRequestDto(
            conversationId = "abc-123",
            messageIndex = 3,
            type = MessageFeedback.Like.wireValue,
        )

        assertEquals(
            """{"conversationId":"abc-123","messageIndex":3,"type":"like"}""",
            json.encodeToString(body),
        )
    }

    /** Report is the one case that carries a reason, and the web's literal is `user_reported`. */
    @Test
    fun `report feedback body carries the web's reason literal`() {
        val body = SaveFeedbackRequestDto(
            conversationId = "abc-123",
            messageIndex = 0,
            type = MessageFeedback.Report.wireValue,
            reason = "user_reported",
        )

        assertEquals(
            """{"conversationId":"abc-123","messageIndex":0,"type":"report","reason":"user_reported"}""",
            json.encodeToString(body),
        )
    }

    @Test
    fun `delete feedback body matches the web DELETE shape`() {
        val body = DeleteFeedbackRequestDto(
            conversationId = "abc-123",
            messageIndex = 2,
            type = MessageFeedback.Dislike.wireValue,
        )

        assertEquals(
            """{"conversationId":"abc-123","messageIndex":2,"type":"dislike"}""",
            json.encodeToString(body),
        )
    }

    /** The backend validates `type` against exactly this set (400 otherwise). */
    @Test
    fun `feedback wire values match the backend's accepted set`() {
        assertEquals("like", MessageFeedback.Like.wireValue)
        assertEquals("dislike", MessageFeedback.Dislike.wireValue)
        assertEquals("report", MessageFeedback.Report.wireValue)
    }
}
