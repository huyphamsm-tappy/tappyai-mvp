package com.tappyai.app.chat

import android.net.Uri
import com.tappyai.app.history.StoredChatMessage
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
    /** Grounded shopping decision from the `[TAPPY_SHOPPING]` marker, when the turn produced one. */
    val shopping: ShoppingDecision? = null,
    // Positional render list (text + inline photo galleries in stream order — web formatMessage
    // parity, see [ReplySegment]). Empty for user/error/restored messages → render [text] directly.
    val segments: List<ReplySegment> = emptyList(),
    val isError: Boolean = false,
    val imageUri: Uri? = null,
)

/**
 * Turns a conversation loaded from Chat history into renderable messages.
 *
 * Persisted assistant text is RAW — it still carries whatever marker blocks the reply contained.
 * The web stores `m.content` verbatim (`ChatInterface`'s `onSave`) and re-parses on every render
 * (`parsePlan` → `parseCTA` → `parseFollowups` → `parseShoppingMarker`), so a client that resumes a
 * conversation must parse it too. Android used to assign `stored.content` straight to [ChatMessage.text],
 * which meant reopening a shopping turn — one made on the web, or on an Android build older than the
 * marker parser — showed a wall of raw `[TAPPY_SHOPPING]{…}` JSON. Parsing here reuses the exact
 * chain the live stream uses, so resumed and live replies can never disagree.
 *
 * User turns are deliberately NOT parsed: their text is the person's own words, not a reply
 * envelope, and stripping bracketed text from what someone typed would be wrong.
 *
 * [segments] is left empty, as it always was for restored messages — [ChatResponseParser.parse]
 * already strips image markdown out of `text`, which is what the renderer falls back to.
 */
internal fun restoredMessages(stored: List<StoredChatMessage>, firstId: Long): List<ChatMessage> =
    stored.mapIndexed { index, message ->
        val isUser = message.role == "user"
        val parsed = if (isUser) null else ChatResponseParser.parse(message.content)
        ChatMessage(
            id = firstId + index,
            role = if (isUser) TappyChatRole.User else TappyChatRole.Assistant,
            text = parsed?.text ?: message.content,
            plan = parsed?.plan,
            ctaButtons = parsed?.ctaButtons ?: emptyList(),
            shopping = parsed?.shopping,
        )
    }
