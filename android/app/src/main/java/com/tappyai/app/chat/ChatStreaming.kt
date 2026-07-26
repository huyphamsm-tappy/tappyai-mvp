package com.tappyai.app.chat

/**
 * The text to show for a still-streaming assistant reply. The model appends its machine markers
 * (`[TAPPY_PLAN]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`) at the very end of a reply, so during streaming
 * we cut the display at the first marker start — hiding both a fully-arrived block AND a partial
 * trailing one (e.g. `…[TAPPY_P`) so raw JSON never flashes in the bubble. The final parsed text +
 * plan card + CTA + followups replace this once the stream finishes (see [ChatViewModel]).
 *
 * The web achieves the same effect implicitly because its char-reveal (`useSmoothText`) lags the
 * raw stream, so the trailing markers are parsed off before the reveal reaches them; without that
 * lag on Android we strip them explicitly.
 */
private val STREAMING_MARKER_PREFIXES = listOf("[tappy_plan]", "[cta_buttons]", "[followups]")

private val INTERNAL_BOOKING_NAME_REGEX = Regex("""[?&]name=([^&]+)""")
private val FIRST_BOLD_REGEX = Regex("""\*\*([^*]{3,40})\*\*""")

/**
 * The place name the chat "Save place" affordance pre-fills, mirroring the web `detectFirstPlaceName`
 * (`ChatInterface.tsx`): an `internal_booking` CTA's `name=` param first, else the first bold
 * `**…**` (3–40 chars) in the reply, else empty (the user can still type one).
 */
fun detectFirstPlaceName(text: String, ctaButtons: List<ChatCtaButton>): String {
    ctaButtons.firstOrNull { it.type == "internal_booking" }?.let { button ->
        INTERNAL_BOOKING_NAME_REGEX.find(button.url)?.let { match ->
            return runCatching {
                java.net.URLDecoder.decode(match.groupValues[1].replace("+", " "), "UTF-8")
            }.getOrDefault("")
        }
    }
    return FIRST_BOLD_REGEX.find(text)?.groupValues?.get(1) ?: ""
}

fun streamingDisplayText(raw: String): String {
    val lower = raw.lowercase()
    var cut = raw.length
    // Cut at the earliest fully-formed opening marker.
    for (marker in STREAMING_MARKER_PREFIXES) {
        val idx = lower.indexOf(marker)
        if (idx in 0 until cut) cut = idx
    }
    // Also cut at a trailing partial marker (a '[' that could be the start of one of the markers).
    val lastBracket = raw.lastIndexOf('[')
    if (lastBracket in 0 until cut) {
        val tail = lower.substring(lastBracket)
        if (STREAMING_MARKER_PREFIXES.any { it.startsWith(tail) }) cut = lastBracket
    }
    return raw.substring(0, cut).trimEnd()
}
