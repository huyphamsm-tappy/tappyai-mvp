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
    /** Matches web's `userPreferences: string[]` (`ChatInterface.tsx:579`); an empty list has the
     *  same server-side effect as the web omitting the field entirely. */
    val userPreferences: List<String> = emptyList(),
    /** Matches web's `responseStyle` (`ChatInterface.tsx:580`, `route.ts`'s `rs.tone`/`rs.length`).
     *  Null tone/length falls through the backend's checks the same as the web omitting the field. */
    val responseStyle: ResponseStyleDto? = null,
    /** Device location for search bias — mirrors web's `userLocation: {lat,lng,address}`
     *  (`ChatInterface.tsx:580`, `route.ts:72`). Omitted (encodeDefaults=false) when unavailable,
     *  which the backend treats identically to the web sending no location. */
    val userLocation: UserLocationDto? = null,
)

@Serializable
data class ResponseStyleDto(val tone: String? = null, val length: String? = null)

@Serializable
data class UserLocationDto(val lat: Double, val lng: Double, val address: String? = null)

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
