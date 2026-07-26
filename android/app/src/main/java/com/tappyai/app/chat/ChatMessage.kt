package com.tappyai.app.chat

import android.net.Uri
import com.tappyai.core.designsystem.component.TappyChatRole

/** One message in a conversation. [isError] flags backend error responses so the UI can
 *  suppress action buttons that don't apply to error text (copy, share, feedback, TTS).
 *  [imageUri] is a locally-picked photo attached to a user turn (vision input, mirrors the
 *  web's `experimental_attachments`) — display-only here; [ChatRepository] reads and
 *  base64-encodes it at send time, it is never persisted as base64 in this model.
 *  [followups] and [ctaButtons] are parsed out of the raw assistant reply text (see
 *  [ChatRepository.parseAssistantReply]) — real, response-specific suggestions from the model,
 *  not a static per-category lookup. */
data class ChatMessage(
    val id: Long,
    val role: TappyChatRole,
    val text: String,
    val followups: List<String> = emptyList(),
    val ctaButtons: List<ChatCtaButton> = emptyList(),
    val isError: Boolean = false,
    val imageUri: Uri? = null,
    /** Parsed `[TAPPY_PLAN]` itinerary rendered as a card below the text; null when the reply
     *  carries no plan. Populated only when the stream finishes (see [ChatViewModel]). */
    val plan: TripPlan? = null,
    /** True while this assistant message is still streaming in — the UI reveals text incrementally
     *  and defers the action bar / plan card until the stream finishes. */
    val streaming: Boolean = false,
)
