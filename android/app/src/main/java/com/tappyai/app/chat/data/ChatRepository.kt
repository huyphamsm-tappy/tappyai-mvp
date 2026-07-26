package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatCtaButton
import com.tappyai.app.chat.ChatMessage
import kotlinx.coroutines.flow.Flow

/** The assistant's raw reply text with the model's own special-purpose markers extracted out —
 *  mirrors `ChatInterface.tsx`'s `parsePlan` → `parseCTA` → `parseFollowups` chain exactly, in
 *  the same order. [text] is what's left after all three markers are stripped. */
data class ParsedAssistantReply(
    val text: String,
    val ctaButtons: List<ChatCtaButton>,
    val followups: List<String>,
    /** Parsed `[TAPPY_PLAN]` itinerary, or null when the reply has none. */
    val plan: com.tappyai.app.chat.TripPlan? = null,
)

/**
 * Repository contract for the Chat AI feature.
 *
 * [streamReply] connects to `/api/chat` and emits raw text tokens as they arrive from the
 * Vercel AI SDK data stream. The Flow completes normally at end-of-stream and throws
 * [ChatException] on API-level errors (rate limit, daily cap, etc.) or [java.io.IOException]
 * on network failure. Cancelling the collecting coroutine (user taps Stop) immediately cancels
 * the underlying HTTP call — no waiting for a 30-second timeout. [userPreferences] mirrors the
 * web's `userPreferences` request field (`ChatInterface.tsx:579`) — the user's saved freeform
 * preference tags, sent on every turn so the model can bias recommendations; an empty list has
 * the same effect as the web omitting the field entirely (`route.ts`'s `Array.isArray` check).
 *
 * [parseAssistantReply] is client-side only — the model embeds these markers directly in its
 * streamed text (see `src/lib/ai/promptBuilder.ts`), there is no separate structured field for
 * them in the `/api/chat` response.
 */
interface ChatRepository {
    fun streamReply(
        messages: List<ChatMessage>,
        userPreferences: List<String> = emptyList(),
        responseStyle: ResponseStyleDto? = null,
    ): Flow<String>
    fun parseAssistantReply(raw: String): ParsedAssistantReply
}
