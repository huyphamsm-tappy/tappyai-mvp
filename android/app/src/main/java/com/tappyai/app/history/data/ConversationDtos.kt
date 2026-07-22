package com.tappyai.app.history.data

import com.tappyai.app.history.Conversation
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset

/**
 * Wire DTOs for `GET /api/conversations` — a bare JSON array of rows (snake_case). The endpoint
 * returns the full `messages` jsonb array (not a count), so [messageCount] is derived from its size.
 * `messages` is typed as a raw [JsonElement] so it deserializes regardless of the per-message shape
 * (and a non-array value degrades to count 0 rather than failing the whole list). Domain model
 * [Conversation] is unchanged — the ISO→millis + count mapping lives here.
 */
@Serializable
data class ConversationDto(
    val id: String = "",
    val title: String? = null,
    val category: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    val messages: JsonElement? = null,
)

@Serializable
data class OkResponseDto(val ok: Boolean = false)

/**
 * `POST /api/conversations` body. [category] is the chat's [com.tappyai.app.chat.ChatCategory] as a
 * lowercase wire value, matching the web's `?category=` query param values. The backend caps
 * [messages] at 200 rows / 512 KB and defaults a blank [title].
 */
@Serializable
data class CreateConversationRequestDto(
    val title: String,
    val category: String,
    val messages: List<StoredMessageDto>,
)

/** `PUT /api/conversations` body — replaces the row's title+messages wholesale (the backend also
 *  refreshes `updated_at`). The web sends the full array every save rather than a delta; matching
 *  that keeps the two clients' write semantics identical. */
@Serializable
data class UpdateConversationRequestDto(
    val id: String,
    val title: String,
    val messages: List<StoredMessageDto>,
)

/**
 * One stored turn inside a conversation's `messages` jsonb array. Field names/role values match
 * exactly what the web writes and reads (`src/components/ChatInterface.tsx`'s `onSave` maps each
 * AI-SDK message to `{role, content}` before POST/PUT; `src/app/chat/[id]/ChatConversation.tsx`
 * types the read-back the same way) — richer AI-SDK fields (id/createdAt/toolInvocations) are
 * never persisted, so there is nothing else to carry here.
 */
@Serializable
data class StoredMessageDto(
    val role: String = "",
    val content: String = "",
)

/** Decodes [ConversationDto.messages] into typed rows; a malformed/absent payload degrades to an
 *  empty list rather than failing the whole conversation load. */
fun ConversationDto.decodeMessages(json: Json): List<StoredMessageDto> {
    val array = messages as? JsonArray ?: return emptyList()
    return try {
        array.map { json.decodeFromJsonElement<StoredMessageDto>(it) }
    } catch (_: Exception) {
        emptyList()
    }
}

fun ConversationDto.toDomain(): Conversation = Conversation(
    id = id,
    title = title?.takeIf { it.isNotBlank() } ?: "Untitled",
    category = category ?: "general",
    updatedAtMillis = parseTimestampMillis(updatedAt) ?: 0L,
    messageCount = (messages as? JsonArray)?.size ?: 0,
)

/** Parses a Postgres/ISO-8601 timestamp to epoch millis; null/unparseable → null. */
private fun parseTimestampMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    val normalized = iso.trim().replace(' ', 'T')
    return try {
        OffsetDateTime.parse(normalized).toInstant().toEpochMilli()
    } catch (_: Exception) {
        try {
            LocalDateTime.parse(normalized).toInstant(ZoneOffset.UTC).toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }
}
