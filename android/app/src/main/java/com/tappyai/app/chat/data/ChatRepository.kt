package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatCategory
import com.tappyai.app.chat.ChatMessage
import kotlinx.coroutines.flow.Flow

/**
 * Repository contract for the Chat AI feature.
 *
 * [streamReply] connects to `/api/chat` and emits raw text tokens as they arrive from the
 * Vercel AI SDK data stream. The Flow completes normally at end-of-stream and throws
 * [ChatException] on API-level errors (rate limit, daily cap, etc.) or [java.io.IOException]
 * on network failure. Cancelling the collecting coroutine (user taps Stop) immediately cancels
 * the underlying HTTP call — no waiting for a 30-second timeout.
 *
 * [getFollowups] is client-side only; the backend does not return follow-up suggestions.
 */
interface ChatRepository {
    fun streamReply(messages: List<ChatMessage>): Flow<String>
    fun getFollowups(category: ChatCategory): List<String>
}
