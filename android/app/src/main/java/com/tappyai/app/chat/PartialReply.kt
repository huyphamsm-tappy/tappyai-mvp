package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.TappyChatRole

/**
 * A6 (02/11): what already arrived of a reply that did not finish, as a reply (web: useChat keeps the streamed text on stop and on error).
 * [interrupted] = the stream failed after text (the web's "interrupted" line under it); false = the person tapped Stop (nothing added).
 * Nothing arrived → null (the caller shows its error bubble as before). The text is read like any reply, so no marker reaches the reader.
 */
internal fun partialReplyMessage(id: Long, raw: String, interrupted: Boolean): ChatMessage? {
    if (raw.isBlank()) return null
    val parsed = ChatResponseParser.parse(ReplyRepeat.cleanRepeats(raw))
    if (parsed.text.isBlank()) return null
    return ChatMessage(
        id = id,
        role = TappyChatRole.Assistant,
        text = parsed.text,
        segments = parsed.segments,
        raw = raw,
        turnStatus = if (interrupted) "interrupted" else null,
    )
}
