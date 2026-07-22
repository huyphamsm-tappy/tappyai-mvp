package com.tappyai.app.chat.data

import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `/api/message-feedback` (camelCase on the wire — the route maps to the table's
 * snake_case columns server-side, so no `@SerialName` remapping is needed here).
 *
 * [SaveFeedbackRequestDto.messageIndex] is the message's position in the conversation's persisted
 * `messages` array — the same array `/api/conversations` stores — so it only means anything once
 * that row exists. The backend upserts on `(user_id, conversation_id, message_index, type)`, which
 * makes a repeated POST of the same feedback idempotent rather than a duplicate row.
 */
@Serializable
data class SaveFeedbackRequestDto(
    val conversationId: String,
    val messageIndex: Int,
    val type: String,
    val reason: String? = null,
)

/** `DELETE /api/message-feedback` body — identifies the exact row to remove (un-like/un-dislike). */
@Serializable
data class DeleteFeedbackRequestDto(
    val conversationId: String,
    val messageIndex: Int,
    val type: String,
)

@Serializable
data class OkFeedbackResponseDto(val ok: Boolean = false)
