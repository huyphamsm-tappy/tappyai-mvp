package com.tappyai.app.chat.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class ChatRequest(
    val messages: List<ChatMessageDto>,
)

/**
 * [content] is [JsonElement] rather than `String` because `/api/chat` accepts two shapes on the
 * wire (`src/app/api/chat/route.ts`'s own `Array.isArray(rawContent)` branch): a plain string for
 * text-only turns, or a content-parts array (`[{type:"text",...}, {type:"image",...}]`) for a
 * turn with a vision attachment — confirmed live against the real endpoint (a solid-red test JPEG
 * sent as `{"type":"image","image":"data:image/jpeg;base64,..."}` came back correctly identified
 * as "Red"). [textContent]/[textAndImageContent] are the only two ways to build one.
 */
@Serializable
data class ChatMessageDto(
    val role: String,
    val content: JsonElement,
)

fun textContent(text: String): JsonElement = JsonPrimitive(text)

fun textAndImageContent(text: String, imageDataUrl: String): JsonElement = buildJsonArray {
    add(buildJsonObject { put("type", "text"); put("text", text) })
    add(buildJsonObject { put("type", "image"); put("image", imageDataUrl) })
}

/**
 * Error envelope returned in the body for all non-2xx responses from `/api/chat`.
 * The [error] field is either a machine-readable code ("free_limit_reached") or a user-facing
 * sentence (the per-minute IP rate-limit message). [message], when present, is always human text.
 */
@Serializable
internal data class ChatErrorDto(
    val error: String? = null,
    val message: String? = null,
)
