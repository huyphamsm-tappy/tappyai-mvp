package com.tappyai.app.chat

import android.net.Uri
import com.tappyai.app.share.PlacesLiveView
import com.tappyai.core.designsystem.component.TappyChatRole

/** One message in a conversation. [isError] flags backend error responses so the UI can
 *  suppress action buttons that don't apply to error text (copy, share, feedback, TTS).
 *  [imageUri] is a locally-picked photo attached to a user turn (vision input, mirrors the
 *  web's `experimental_attachments`) — display-only here; [ChatRepository] reads and
 *  base64-encodes it at send time, it is never persisted as base64 in this model. */
data class ChatMessage(
    val id: Long,
    val role: TappyChatRole,
    val text: String,
    val followups: List<String> = emptyList(),
    // Structured cards parsed out of an assistant reply (web parity — see [ChatResponseParser]).
    val plan: TappyPlan? = null,
    val ctaButtons: List<CtaButton> = emptyList(),
    // D1 — the shopping DECISION for this turn, when the reply carried one. Null on every other
    // turn. Android used to strip this block and render nothing, losing the whole decision.
    val shopping: ShoppingDecisionView? = null,
    // Positional render list (text + inline photo galleries in stream order — web formatMessage
    // parity, see [ReplySegment]). Empty for user/error/restored messages → render [text] directly.
    val segments: List<ReplySegment> = emptyList(),
    // The structured recommendation this turn streamed (the `8:` annotation), used ONLY to build
    // the share artifact. In memory for the session; NOT part of [StoredChatMessage] — Places
    // data is live-only and is never persisted.
    val placesView: PlacesLiveView? = null,
    val isError: Boolean = false,
    val imageUri: Uri? = null,
)
