package com.tappyai.app.chat

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Structured blocks the assistant may embed at the end of its reply. The backend emits the SAME
 * markers to web and Android; the web's ChatInterface parses them out (parsePlan/parseCTA/
 * parseFollowups), strips them from the visible text, and renders rich cards. Android must do the
 * same or the raw `[TAPPY_PLAN]{…}` / `[CTA_BUTTONS]{…}` markers leak into the message text. This
 * is a code-only mirror of the web parser — no backend or response-format change.
 */
@Serializable
data class TappyPlan(
    val type: String? = null,
    val title: String = "",
    val people: Int? = null,
    @SerialName("budget_total") val budgetTotal: String? = null,
    val days: List<PlanDay> = emptyList(),
    @SerialName("cost_breakdown") val costBreakdown: Map<String, String>? = null,
    @SerialName("share_text") val shareText: String? = null,
)

@Serializable
data class PlanDay(
    val label: String = "",
    val items: List<PlanItem> = emptyList(),
)

@Serializable
data class PlanItem(
    val time: String = "",
    val emoji: String = "",
    val category: String = "",
    val name: String = "",
    val description: String? = null,
    val price: String? = null,
    val address: String? = null,
    @SerialName("maps_link") val mapsLink: String? = null,
    @SerialName("booking_link") val bookingLink: String? = null,
    @SerialName("place_id") val placeId: String? = null,
)

/** The CTA button kinds the model emits, mirroring the web's `CTAButton['type']` union. */
enum class CtaType { Maps, Call, Zalo, Website, Booking, Search, InternalBooking, Unknown }

@Serializable
data class CtaButton(
    val label: String = "",
    val type: String = "",
    val url: String = "",
    val primary: Boolean = false,
) {
    val ctaType: CtaType
        get() = when (type) {
            "maps" -> CtaType.Maps
            "call" -> CtaType.Call
            "zalo" -> CtaType.Zalo
            "website" -> CtaType.Website
            "booking" -> CtaType.Booking
            "search" -> CtaType.Search
            "internal_booking" -> CtaType.InternalBooking
            else -> CtaType.Unknown
        }
}

@Serializable
private data class CtaEnvelope(val buttons: List<CtaButton> = emptyList())

/**
 * One positional piece of an assistant reply: markdown text, or a run of consecutive place photos
 * that renders as an inline gallery exactly where it appeared in the reply. Mirrors the web's
 * `formatMessage`, which turns each run of `![..](..)` lines into a horizontal strip AT ITS
 * POSITION — so a recommendation's photos always show inside that recommendation's block, never
 * collected and appended after the whole text.
 */
sealed interface ReplySegment {
    data class Text(val markdown: String) : ReplySegment
    data class Images(val urls: List<String>) : ReplySegment
}

/**
 * A fully-parsed assistant reply.
 * [text] is the clean text with images stripped — what copy/share/TTS/persistence use (unchanged
 * shape, char-for-char what was stored before segments existed).
 * [streamText] keeps the image markdown in place (markers still stripped) — the streaming display
 * source, segmented live so galleries appear mid-stream at their positions.
 * [segments] is the positional render list derived from [streamText].
 */
data class ParsedAssistantReply(
    val text: String,
    val streamText: String,
    val plan: TappyPlan?,
    val ctaButtons: List<CtaButton>,
    val followups: List<String>,
    val segments: List<ReplySegment>,
)

/**
 * Kotlin port of the web ChatInterface parse chain (parsePlan → parseCTA → parseFollowups). Order
 * matters: plan first, then CTA, then followups, each stripping its own block from the text before
 * the next runs, exactly like the web. Recognised marker blocks are always stripped (even when the
 * JSON fails to parse) so a malformed block can never leak the raw marker to the user.
 */
object ChatResponseParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // NOTE: every literal ']' and '}' is escaped (\] / \}). Android's regex engine (unlike the JVM
    // used for unit tests) rejects a lone unescaped ']' or '}' with PatternSyntaxException, which
    // crashed the app in ChatResponseParser.<clinit> on the first AI reply. Keep them escaped.
    private val PLAN_RE = Regex("""\[TAPPY_PLAN\]([\s\S]*?)\[/TAPPY_PLAN\]""", RegexOption.IGNORE_CASE)
    private val CTA_TAG_RE = Regex("""\[CTA_BUTTONS\]([\s\S]*?)\[/CTA_BUTTONS\]""", RegexOption.IGNORE_CASE)
    private val CTA_NOTAG_RE = Regex("""\[CTA_BUTTONS\](\{[\s\S]*\})\s*$""", RegexOption.IGNORE_CASE)
    private val FOLLOWUPS_RE = Regex("""\[FOLLOWUPS\]([^\n]*?)(?:\[/FOLLOWUPS\]|\n|$)""", RegexOption.IGNORE_CASE)
    private val FOLLOWUPS_STRIP_RE = Regex("""\[/?FOLLOWUPS\]""", RegexOption.IGNORE_CASE)
    // Markdown image `![alt](url)` — TappyMarkdown drops images, so they render via segments
    // (mirrors the web formatMessage grouping place photos into a horizontal strip).
    private val IMAGE_RE = Regex("""!\[[^\]]*\]\((https?://[^\s)]+)\)""")
    // A RUN of consecutive image lines = one gallery (web: `(?:!\[..\]\(..\)[ \t]*\n?)+`).
    private val IMAGE_RUN_RE = Regex("""(?:!\[[^\]]*\]\(https?://[^\s)]+\)[ \t]*\n?)+""")
    // A PARTIAL trailing image markdown in a streaming snapshot (`![alt` or `![alt](https://part…`).
    private val PARTIAL_IMAGE_RE = Regex("""!\[[^\]]*(?:\]\([^\s)]*)?$""")

    fun parse(content: String): ParsedAssistantReply {
        var text = content

        // 1. Trip/evening plan.
        val planMatch = PLAN_RE.find(text)
        val plan = planMatch?.let {
            runCatching { json.decodeFromString<TappyPlan>(it.groupValues[1].trim()) }
                .getOrNull()
                ?.takeIf { p -> p.days.isNotEmpty() }
        }
        if (planMatch != null) text = PLAN_RE.replace(text, "").trimEnd()

        // 2. CTA buttons (closing tag, or a bare block at end of content).
        val ctaMatch = CTA_TAG_RE.find(text) ?: CTA_NOTAG_RE.find(text)
        val buttons = ctaMatch?.let {
            runCatching { json.decodeFromString<CtaEnvelope>(it.groupValues[1].trim()).buttons }.getOrNull()
        } ?: emptyList()
        if (ctaMatch != null) {
            text = CTA_TAG_RE.replace(text, "")
            text = CTA_NOTAG_RE.replace(text, "").trimEnd()
        }

        // 3. Follow-up suggestion chips.
        val fuMatch = FOLLOWUPS_RE.find(text)
        val followups = fuMatch?.groupValues?.get(1)
            ?.split("|")?.map { it.trim() }?.filter { it.isNotBlank() }?.take(3)
            ?: emptyList()
        if (fuMatch != null) text = FOLLOWUPS_RE.replace(text, "")

        // Safety net: strip any orphan markers so implementation details never show.
        text = FOLLOWUPS_STRIP_RE.replace(text, "").trim()

        // 4. Positional segmentation — each run of image lines becomes an inline gallery at its
        // position (web formatMessage), and the clean text keeps its pre-segments shape for
        // copy/share/TTS/persistence.
        return ParsedAssistantReply(
            text = IMAGE_RE.replace(text, "").trim(),
            streamText = text,
            plan = plan,
            ctaButtons = buttons,
            followups = followups,
            segments = segment(text),
        )
    }

    /**
     * Splits [text] into ordered [ReplySegment]s: markdown between image runs, and each run of
     * consecutive `![..](..)` lines as one [ReplySegment.Images] gallery. Positional — the web's
     * `formatMessage` replacement semantics, so render order equals stream order.
     */
    fun segment(text: String): List<ReplySegment> {
        val segments = mutableListOf<ReplySegment>()
        var cursor = 0
        for (run in IMAGE_RUN_RE.findAll(text)) {
            val before = text.substring(cursor, run.range.first).trim()
            if (before.isNotEmpty()) segments += ReplySegment.Text(before)
            val urls = IMAGE_RE.findAll(run.value).map { it.groupValues[1] }.toList()
            if (urls.isNotEmpty()) segments += ReplySegment.Images(urls)
            cursor = run.range.last + 1
        }
        val tail = text.substring(cursor).trim()
        if (tail.isNotEmpty()) segments += ReplySegment.Text(tail)
        return segments
    }

    /**
     * Drops a partial trailing `![alt](https://…` from a streaming snapshot so a half-arrived
     * image markdown never flashes as raw URL text mid-typewriter — the gallery appears the moment
     * its closing `)` arrives. Complete images earlier in the text are untouched.
     */
    fun trimPartialImage(text: String): String = PARTIAL_IMAGE_RE.replace(text, "").trimEnd()
}
