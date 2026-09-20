package com.tappyai.app.chat.data

import com.tappyai.app.chat.PLACES_ANNOTATION_KIND
import com.tappyai.app.chat.PlacesLiveView
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/**
 * One line of the `/api/chat` data stream, decoded.
 *
 * Split out of [RealChatRepository] so the wire format has ONE reader. The repository needs OkHttp,
 * Hilt and a live socket to construct, which meant the frame rules could only ever be checked by
 * reading them — and the frame rules are exactly what went wrong: Android recognised `0:` and threw
 * every other part type away, so the turn's place decision, which the server sends on `8:`, never
 * reached the phone. A parser that cannot be run in a test is a parser nobody tests.
 *
 * Nothing about the server contract changes here. This object is the same conditional that lived
 * inside the repository, in a place a test can reach.
 */
object ChatStreamFrames {

    /** The progress annotation's kind (server `progressAnnotation.ts`, A1(b)). */
    const val PROGRESS_ANNOTATION_KIND = "tappy.progress.v1"

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * Turns one stream line into an event, or into nothing.
     *
     * Stream lines are `{partType}:{jsonPayload}`.
     *
     *   `0:` text delta, payload a JSON-encoded string (`0:"Hello "`).
     *   `8:` MESSAGE ANNOTATION, payload a JSON array. The server sends the turn's place decision
     *        here and has done since web gained its place card — and, since A1 (2026-09-20), the
     *        preliminary set at the tool result and the turn's progress (`tappy.progress.v1`).
     *
     * Every other part type — tool calls (`2`), step finish (`e`), done (`d`) — is skipped, and an
     * annotation this version does not recognise is skipped too: an unknown frame must never become
     * a crash or a visible artefact. The annotation is gated on its own `kind`, so a DIFFERENT
     * annotation riding the same part cannot be mistaken for a place decision. An optional `data: `
     * SSE wrapper is stripped defensively in case the stream format ever changes to full SSE.
     */
    fun parse(line: String): ChatStreamEvent? {
        val stripped = if (line.startsWith("data: ")) line.removePrefix("data: ") else line
        if (stripped.startsWith("0:")) {
            return runCatching {
                ChatStreamEvent.Text(json.decodeFromString<String>(stripped.removePrefix("0:")))
            }.getOrNull()
        }
        if (stripped.startsWith("8:")) {
            return runCatching {
                // Each element is gated on its own `kind`: a frame this version does not know is
                // skipped, and a known one is decoded by its own shape — a progress element has no
                // `items`, so decoding the whole array as place views would drop the place view too.
                val root = json.parseToJsonElement(stripped.removePrefix("8:")).jsonArray
                var event: ChatStreamEvent? = null
                for (element in root) {
                    val obj = element as? JsonObject ?: continue
                    when (obj["kind"]?.jsonPrimitive?.contentOrNull) {
                        PLACES_ANNOTATION_KIND -> {
                            val view = json.decodeFromJsonElement<PlacesLiveView>(obj)
                            if (view.items.isNotEmpty()) { event = ChatStreamEvent.Places(view); break }
                        }
                        PROGRESS_ANNOTATION_KIND -> {
                            val text = obj["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            val stage = obj["stage"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            if (text.isNotBlank()) { event = ChatStreamEvent.Progress(stage, text); break }
                        }
                    }
                }
                event
            }.getOrNull()
        }
        return null
    }
}
