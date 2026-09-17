package com.tappyai.app.chat.data

import com.tappyai.app.chat.PLACES_ANNOTATION_KIND
import com.tappyai.app.chat.PlacesLiveView
import kotlinx.serialization.json.Json

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

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * Turns one stream line into an event, or into nothing.
     *
     * Stream lines are `{partType}:{jsonPayload}`.
     *
     *   `0:` text delta, payload a JSON-encoded string (`0:"Hello "`).
     *   `8:` MESSAGE ANNOTATION, payload a JSON array. The server sends the turn's place decision
     *        here and has done since web gained its place card.
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
                json.decodeFromString<List<PlacesLiveView>>(stripped.removePrefix("8:"))
                    .firstOrNull { it.kind == PLACES_ANNOTATION_KIND && it.items.isNotEmpty() }
                    ?.let { ChatStreamEvent.Places(it) }
            }.getOrNull()
        }
        return null
    }
}
