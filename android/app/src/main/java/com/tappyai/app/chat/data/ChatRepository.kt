package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatCategory
import com.tappyai.app.chat.ChatMessage
import com.tappyai.app.chat.PlacesLiveView
import kotlinx.coroutines.flow.Flow

/**
 * Repository contract for the Chat AI feature.
 *
 * [streamReply] connects to `/api/chat` and emits [ChatStreamEvent]s as they arrive from the
 * Vercel AI SDK data stream. The Flow completes normally at end-of-stream and throws
 * [ChatException] on API-level errors (rate limit, daily cap, etc.) or [java.io.IOException]
 * on network failure. Cancelling the collecting coroutine (user taps Stop) immediately cancels
 * the underlying HTTP call — no waiting for a 30-second timeout.
 *
 * [getFollowups] is client-side only; the backend does not return follow-up suggestions.
 */
/**
 * One thing the stream said.
 *
 * 🚨 THE STREAM WAS NEVER TEXT-ONLY — ANDROID JUST READ IT THAT WAY. `/api/chat` is a Vercel AI
 * SDK data stream of `{partType}:{json}` lines, and the server has been sending the turn's place
 * decision on the `8:` ANNOTATION part for as long as web has rendered a place card. Android
 * returned `Flow<String>` and discarded every non-`0:` line, so the same reply produced a rich
 * decision card in the browser and bare prose on the phone. Nothing about the server contract
 * changes to fix that — the frame was always there; this type is what lets it be carried.
 */
sealed interface ChatStreamEvent {
    /** A text delta (`0:`) — the assistant's prose, markers included. */
    data class Text(val delta: String) : ChatStreamEvent

    /**
     * The turn's LIVE place decision (`8:`). Session-only by design: it is never persisted, so
     * the durable `[TAPPY_PLACES]` block in the text is what survives a reload.
     */
    data class Places(val view: PlacesLiveView) : ChatStreamEvent
}

interface ChatRepository {
    fun streamReply(messages: List<ChatMessage>): Flow<ChatStreamEvent>
    fun getFollowups(category: ChatCategory): List<String>
}
