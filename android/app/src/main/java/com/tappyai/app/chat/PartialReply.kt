package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.TappyChatRole

/** A7 (02/11): re-read the live text when 50 ms have passed since the last time, or the new piece ends a line. */
internal fun reparseDue(lastAtMs: Long, nowMs: Long, delta: String): Boolean = nowMs - lastAtMs >= 50 || '\n' in delta

/**
 * A6 (02/11): what already arrived of a reply that did not finish, as a reply (web: useChat keeps the streamed text on stop and on error).
 * [interrupted] = the stream failed after text (the web's "interrupted" line under it); false = the person tapped Stop (nothing added).
 * Nothing arrived → null (the caller shows its error bubble as before). The text is read like any reply, so no marker reaches the reader.
 */
internal fun partialReplyMessage(id: Long, raw: String, interrupted: Boolean, annotations: TurnAnnotations? = null): ChatMessage? {
    if (raw.isBlank()) return null
    val parsed = ChatResponseParser.parse(ReplyRepeat.cleanRepeats(raw))
    if (parsed.text.isBlank()) return null
    return ChatMessage(
        id = id,
        role = TappyChatRole.Assistant,
        text = parsed.text,
        segments = parsed.segments,
        raw = raw,
        // review 01/11: the research card, the charts and the section pictures the turn had sent ride with the partial text, as on the web
        research = annotations?.research,
        charts = annotations?.charts ?: emptyList(),
        docMedia = annotations?.docMedia ?: emptyList(),
        turnStatus = if (interrupted) "interrupted" else null,
    )
}

/** The live annotations of the turn streaming right now (a Deep Research turn's card, charts and pictures), kept so a Stop or a drop after text still has them. */
internal class TurnAnnotations {
    var research: com.tappyai.app.chat.data.ResearchStatus? = null
    var charts: List<com.tappyai.app.chat.data.ResearchChart> = emptyList()
    var docMedia: List<com.tappyai.app.chat.data.DocMediaItem> = emptyList()
}
