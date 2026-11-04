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
    /**
     * A `3:` frame — the SDK's error part (contract OUTPUT-CONTRACT-6-DOMAINS §1.4 / §5(f)): the turn
     * failed server-side after the stream opened. Returns the payload (often the SDK's English
     * default "An error occurred.", which is never shown), or null for any other line. Before
     * 2026-09-28 it fell through [parse] and was dropped, so an errored turn ended as a silent,
     * empty or half reply with no error state.
     */
    fun errorFrame(line: String): String? {
        val stripped = if (line.startsWith("data: ")) line.removePrefix("data: ") else line
        if (!stripped.startsWith("3:")) return null
        return runCatching { json.decodeFromString<String>(stripped.removePrefix("3:")) }.getOrDefault("")
    }

    /** A `d:` (finish) or `3:` (error) frame — the two ways the route ends a data stream (web `streamCut.ts`: `/^(?:d|3):/`). */
    fun isEndFrame(line: String): Boolean {
        val stripped = if (line.startsWith("data: ")) line.removePrefix("data: ") else line
        return stripped.startsWith("d:") || stripped.startsWith("3:")
    }

    /** The first event of a line (the callers from before A3); [events] reads them all. */
    fun parse(line: String): ChatStreamEvent? = events(line).firstOrNull()

    /**
     * Every event of one stream line, in order. A3 (02/11, the one-brain stream): an `8:` array can carry several annotations at once
     * (progress + the research card, …), so each element is read; `9:` / `a:` are the tool call and its result (the web's tool hint).
     */
    fun events(line: String): List<ChatStreamEvent> {
        val stripped = if (line.startsWith("data: ")) line.removePrefix("data: ") else line
        if (stripped.startsWith("0:")) {
            return listOfNotNull(runCatching {
                ChatStreamEvent.Text(json.decodeFromString<String>(stripped.removePrefix("0:")))
            }.getOrNull())
        }
        if (stripped.startsWith("9:") || stripped.startsWith("a:")) {
            return listOfNotNull(runCatching {
                val obj = json.parseToJsonElement(stripped.substring(2)) as? JsonObject ?: return@runCatching null
                val id = obj["toolCallId"]?.jsonPrimitive?.contentOrNull ?: return@runCatching null
                if (stripped[0] == 'a') ChatStreamEvent.ToolResult(id)
                else ChatStreamEvent.ToolCall(id, obj["toolName"]?.jsonPrimitive?.contentOrNull ?: return@runCatching null)
            }.getOrNull())
        }
        if (stripped.startsWith("8:")) {
            val root = runCatching { json.parseToJsonElement(stripped.removePrefix("8:")).jsonArray }.getOrNull() ?: return emptyList()
            // Each element is gated on its own `kind` (or `type`, the research frames): a frame this version does not know is skipped,
            // and a known one is decoded by its own shape — a progress element has no `items`, so decoding the whole array as place views
            // would drop the place view too. A malformed element is dropped on its own.
            return root.mapNotNull { element ->
                val obj = element as? JsonObject ?: return@mapNotNull null
                runCatching {
                    when (obj["kind"]?.jsonPrimitive?.contentOrNull ?: obj["type"]?.jsonPrimitive?.contentOrNull) {
                        PLACES_ANNOTATION_KIND -> json.decodeFromJsonElement<PlacesLiveView>(obj).takeIf { it.items.isNotEmpty() }?.let { ChatStreamEvent.Places(it) }
                        PROGRESS_ANNOTATION_KIND -> {
                            val text = obj["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            val stage = obj["stage"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            if (text.isNotBlank()) ChatStreamEvent.Progress(stage, text) else null
                        }
                        OneBrainFrames.RESEARCH_TYPE -> OneBrainFrames.research(obj)?.let { ChatStreamEvent.Research(it) }
                        OneBrainFrames.CHARTS_TYPE -> OneBrainFrames.charts(obj).takeIf { it.isNotEmpty() }?.let { ChatStreamEvent.Charts(it) }
                        OneBrainFrames.DOC_MEDIA_KIND -> OneBrainFrames.docMedia(obj).takeIf { it.isNotEmpty() }?.let { ChatStreamEvent.DocMedia(it) }
                        OneBrainFrames.TURN_STATUS_KIND -> OneBrainFrames.turnStatus(obj)?.let { ChatStreamEvent.TurnStatus(it) }
                        else -> null
                    }
                }.getOrNull()
            }
        }
        return emptyList()
    }
}

/**
 * Tracks how one `/api/chat` body ended. A reply that closed cleanly after at least one line but with
 * neither a `d:` nor a `3:` frame is a CUT reply (web `watchStreamCut`, `src/lib/chat/streamCut.ts`):
 * [cut] is false for an empty body, and an aborted call or a network error never reaches the end of the
 * loop, so neither is reported as a cut.
 */
class ChatStreamEnd {
    private var sawAny = false
    private var finished = false

    fun feed(line: String) {
        sawAny = true
        if (ChatStreamFrames.isEndFrame(line)) finished = true
    }

    val cut: Boolean get() = sawAny && !finished
}
