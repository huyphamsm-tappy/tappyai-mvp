package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatMessage
import com.tappyai.core.designsystem.component.TappyChatRole

/** What an earlier turn's photo becomes in the history: a note, not the photo again (web: `[Attached with this message: names]`). */
internal const val ATTACHED_NOTE = "[Attached with this message: photo]"

/**
 * A7 (02/11): the history as the web compacts it before sending (src/lib/chat/requestHistory.ts compactRequestMessages). Only the LAST user
 * turn sends its photo (before, every earlier photo was read and base64-encoded again on every turn, and a long chat grew toward a 413);
 * an earlier one says a photo was attached. Only the LAST reply goes as it arrived (its markers carry the turn's state the server reads);
 * an earlier reply goes as its prose ([ChatMessage.text], markers already stripped). The server compacts again; this only saves bytes.
 * [hasImage] is how a turn's photo is seen (a test passes its own: a plain JVM test has no android.net.Uri).
 */
internal fun compactHistory(messages: List<ChatMessage>, hasImage: (ChatMessage) -> Boolean = { it.imageUri != null }): List<ChatMessage> {
    val lastUser = messages.indexOfLast { it.role == TappyChatRole.User }
    val lastAssistant = messages.indexOfLast { it.role == TappyChatRole.Assistant }
    return messages.mapIndexed { i, m ->
        when {
            m.role == TappyChatRole.User && i != lastUser && hasImage(m) -> {
                // a PDF is named, a photo is "photo" (web: the attachment's name)
                val note = m.attachmentName?.takeIf { m.attachmentMime == PDF_MIME }?.let { "[Attached with this message: $it]" } ?: ATTACHED_NOTE
                m.copy(imageUri = null, attachmentMime = null, attachmentName = null, text = if (m.text.isBlank()) note else "${m.text}\n$note")
            }
            m.role == TappyChatRole.Assistant && i != lastAssistant && m.raw.isNotEmpty() -> m.copy(raw = "")
            else -> m
        }
    }
}
