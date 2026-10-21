package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.TappyChatRole

/**
 * What is kept of a reply that did not finish: the person pressed Stop, or the stream broke after
 * part of the answer had arrived. Web's `useChat` leaves that part in the conversation (`stop()`
 * and a failed stream both keep the message); Android used to drop it, so a long answer the person
 * had half read vanished. Built exactly like a finished reply — same repeat cleanup, same parser,
 * `raw` carried for storage — except that no follow-up request is made for a broken turn.
 *
 * Returns null when nothing readable arrived (no text, no card), so the ordinary error path applies.
 */
internal fun partialAssistantMessage(id: Long, rawReply: String, livePlaces: PlacesLiveView?): ChatMessage? {
    if (rawReply.isBlank() && livePlaces == null) return null
    val finalReply = ReplyRepeat.cleanRepeats(rawReply)
    val parsed = ChatResponseParser.parse(finalReply)
    val readable = parsed.text.isNotBlank() || parsed.plan != null || parsed.shopping != null ||
        parsed.places.isNotEmpty() || parsed.ask.isNotEmpty() || livePlaces != null
    if (!readable) return null
    return ChatMessage(
        id = id,
        role = TappyChatRole.Assistant,
        text = parsed.text,
        plan = parsed.plan,
        planJson = parsed.planJson,
        ctaButtons = parsed.ctaButtons,
        segments = parsed.segments,
        followups = parsed.followups,
        ask = parsed.ask,
        shopping = parsed.shopping,
        media = parsed.media,
        places = parsed.places,
        livePlaces = livePlaces,
        placesView = livePlaces?.toShareView(),
        raw = finalReply,
    )
}
