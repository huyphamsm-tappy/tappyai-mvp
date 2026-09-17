package com.tappyai.app.chat

import android.net.Uri
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
    // The plan block verbatim — the payload a plan share publishes (see ParsedAssistantReply.planJson).
    val planJson: String? = null,
    val ctaButtons: List<CtaButton> = emptyList(),
    // D1 — the shopping DECISION for this turn, when the reply carried one. Null on every other
    // turn. Android used to strip this block and render nothing, losing the whole decision.
    val shopping: ShoppingDecisionView? = null,
    // The DURABLE place cards this turn carried, best first (see [PersistedPlace]). Unlike the
    // live places rail these ride in the message TEXT, so they are rebuilt from storage on reload.
    val places: List<PersistedPlace> = emptyList(),
    // The LIVE place decision for this turn, from the `8:` annotation. Session-only: it is never
    // persisted, so a reopened conversation falls back to [places], which is. Preferred while it
    // is here because it is the richer of the two projections (see [PlacesLiveView]).
    val livePlaces: PlacesLiveView? = null,
    // Positional render list (text + inline photo galleries in stream order — web formatMessage
    // parity, see [ReplySegment]). Empty for user/error/restored messages → render [text] directly.
    val segments: List<ReplySegment> = emptyList(),
    // The same `8:` recommendation projected for the share artifact (V3 share parity). Derived
    // from [livePlaces] via [toShareView] when the turn is built — one frame, two consumers, one
    // parse. In memory for the session; NOT part of [StoredChatMessage] — Places data is
    // live-only and is never persisted.
    val placesView: com.tappyai.app.share.PlacesLiveView? = null,
    val isError: Boolean = false,
    val imageUri: Uri? = null,
    /**
     * The assistant's reply EXACTLY as it arrived, markers included.
     *
     * [text] is what the user reads: structured blocks decoded and stripped out. That makes it the
     * wrong thing to persist, and persisting it is what this field exists to stop. A marker is the
     * only channel that survives a save/reload round trip (see [ChatResponseParser]) — the server
     * puts the plan, the CTA buttons and the shopping decision IN THE TEXT precisely so a reopened
     * conversation can rebuild them. Android saved the stripped text instead, so every structured
     * card was silently destroyed at save time and a reopened chat showed prose where web and iOS
     * both show the cards. Both of those clients store the raw content and parse at render; this
     * field is Android joining them without changing when parsing happens.
     *
     * Empty for user turns and error bubbles, which have no markers and are not re-parsed.
     */
    val raw: String = "",
)
