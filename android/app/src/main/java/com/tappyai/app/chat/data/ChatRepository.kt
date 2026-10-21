package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatCategory
import com.tappyai.app.chat.ChatMessage
import com.tappyai.app.chat.PlacesLiveView
import kotlinx.coroutines.flow.Flow

/**
 * Repository contract for the Chat AI feature.
 *
 * [streamReply] connects to `/api/chat` and emits [ChatStreamEvent]s as they arrive from the
 * Vercel AI SDK data stream. The Flow completes normally at end-of-stream and throws
 * [ChatException] on API-level errors (rate limit, daily cap, etc.) or [java.io.IOException]
 * on network failure. Cancelling the collecting coroutine (user taps Stop) immediately cancels
 * the underlying HTTP call — no waiting for a 30-second timeout.
 *
 * [getFollowups] is client-side only; the backend does not return follow-up suggestions.
 */
/**
 * One thing the stream said.
 *
 * 🚨 THE STREAM WAS NEVER TEXT-ONLY — ANDROID JUST READ IT THAT WAY. `/api/chat` is a Vercel AI
 * SDK data stream of `{partType}:{json}` lines, and the server has been sending the turn's place
 * decision on the `8:` ANNOTATION part for as long as web has rendered a place card. Android
 * returned `Flow<String>` and discarded every non-`0:` line, so the same reply produced a rich
 * decision card in the browser and bare prose on the phone. Nothing about the server contract
 * changes to fix that — the frame was always there; this type is what lets it be carried.
 */
sealed interface ChatStreamEvent {
    /** A text delta (`0:`) — the assistant's prose, markers included. */
    data class Text(val delta: String) : ChatStreamEvent

    /**
     * The turn's LIVE place decision (`8:`). Session-only by design: it is never persisted, so
     * the durable `[TAPPY_PLACES]` block in the text is what survives a reload.
     */
    data class Places(val view: PlacesLiveView) : ChatStreamEvent

    /**
     * What the pipeline is doing right now (`8:`, kind `tappy.progress.v1`, A1(b)): the row count
     * the search returned, the reply being checked and photos fetched. `text` is written by the
     * server in the turn's language; the client shows it in place of the rotating generic hint.
     * Never text, never persisted. Web parity: `progressAnnotation.ts`.
     */
    data class Progress(val stage: String, val text: String) : ChatStreamEvent

    /**
     * How the server says the turn ENDED when it did not end cleanly (`8:`, kind
     * `tappy.turn_status.v1`, C2 P2): [TurnStatusKind.Incomplete] = the answer stops early,
     * [TurnStatusKind.Interrupted] = a server/provider error broke it while streaming. The screen
     * shows its own fixed line under the reply; the status is never text of the answer, and the
     * client makes no billing claim (the server alone decides about a refund).
     * Web parity: `progressAnnotation.ts` `readTurnStatus`.
     */
    data class TurnStatus(val status: TurnStatusKind) : ChatStreamEvent

    /**
     * The body closed cleanly WITHOUT its finish frame (`d:`) or an error frame (`3:`) — a proxy or
     * function cut the reply half-way. The route always ends a data stream with one of the two, so the
     * text received is half an answer, not a normal one: the screen offers «answer again» (web parity:
     * `src/lib/chat/streamCut.ts`, 56a26ae). Sent last, after every other event of the turn.
     */
    data object Cut : ChatStreamEvent
}

/** The two end states `tappy.turn_status.v1` can carry; any other value is ignored by the reader. */
enum class TurnStatusKind { Incomplete, Interrupted }

interface ChatRepository {
    fun streamReply(messages: List<ChatMessage>, chatSessionId: String? = null): Flow<ChatStreamEvent>
    fun getFollowups(category: ChatCategory): List<String>
}
// The V3 share artifact used to read the `8:` frame through a `takeLatestPlacesView()` side
// channel; it now takes it from [ChatStreamEvent.Places] like the card does (see
// `PlacesLiveView.toShareView`). One frame, one parse, two consumers.
