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
 * Kotlin port of the web ChatInterface parse chain
 * (parsePlan → parseCTA → parseFollowups → parseShoppingMarker). Order matters: each step strips
 * its own block from the text before the next runs, exactly like the web. Recognised marker blocks
 * are always stripped (even when the JSON fails to parse) so a malformed block can never leak the
 * raw marker to the user.
 *
 * 🚨 THE MARKER CONTRACT. The server owns a CLOSED set of marker blocks and injects them into the
 * assistant TEXT stream — the only channel that survives persistence and reload. It does not know
 * or care which client is reading. So every marker the server can emit must be handled HERE, or
 * its raw JSON renders as message body. `[TAPPY_SHOPPING]` shipped web-only and did exactly that
 * (P0-1), the same way `[CTA_BUTTONS]` did before it. When a marker is added server-side, this
 * object and iOS `ContentParser` are part of that change, not a follow-up to it.
 */
object ChatResponseParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // NOTE: every literal ']' and '}' is escaped (\] / \}). Android's regex engine (unlike the JVM
    // used for unit tests) rejects a lone unescaped ']' or '}' with PatternSyntaxException, which
    // crashed the app in ChatResponseParser.<clinit> on the first AI reply. Keep them escaped.
    private val PLAN_RE = Regex("""\[TAPPY_PLAN\]([\s\S]*?)\[/TAPPY_PLAN\]""", RegexOption.IGNORE_CASE)
    // A plan block whose closing tag never arrived. REACHABLE, not defensive: a planning turn runs
    // at maxTokens 4096 and the rulebook tells the model not to shorten a plan, so a reply that
    // stops at finishReason "length" ends mid-JSON — and every frame before the closing tag is a
    // snapshot the screen renders. End-anchored so a mid-text open tag is left to the orphan strip
    // instead of swallowing the rest of the reply.
    private val PLAN_PARTIAL_RE = Regex("""\[TAPPY_PLAN\][\s\S]*$""", RegexOption.IGNORE_CASE)
    private val PLAN_STRIP_RE = Regex("""\[/?TAPPY_PLAN\]""", RegexOption.IGNORE_CASE)
    private val CTA_TAG_RE = Regex("""\[CTA_BUTTONS\]([\s\S]*?)\[/CTA_BUTTONS\]""", RegexOption.IGNORE_CASE)
    // D2 FIX (P4-02). The bare form is located by BRACE MATCHING (findMarkerJson), not by a regex.
    //
    // It used to be `\[CTA_BUTTONS\](\{[\s\S]*\})\s*$` — end-anchored — which is exactly how the
    // raw block reached users on 2026-08-27: the model emits `[FOLLOWUPS]` AFTER the CTA block, and
    // followups are stripped at step 3, so at step 2 something still trailed the block, `\s*$` could
    // not match, nothing was stripped, and the buttons were silently lost. The orphan-tag safety net
    // then removed `[CTA_BUTTONS]` and left `{"buttons":…}` sitting in the message text.
    //
    // Dropping the `$` is worse, not better: `\{[\s\S]*\}` runs greedily to the LAST brace in the
    // message and swallows any trailing prose. Web hit both failures and settled on brace matching;
    // this is the same algorithm, so the two platforms cannot drift again without the shared
    // fixtures failing (shared/structured-content/marker-fixtures.json).
    private const val CTA_MARKER = "[CTA_BUTTONS]"
    // A CTA block whose payload never finished arriving — braces do not balance, so findMarkerJson
    // declines it. END-ANCHORED on purpose: a mid-text open tag falls through to the orphan strip
    // rather than swallowing the rest of the reply. Android had NO equivalent of this pattern,
    // which is why the JSON body survived while the tag was removed.
    private val CTA_PARTIAL_RE = Regex("""\[CTA_BUTTONS\][\s\S]*$""", RegexOption.IGNORE_CASE)
    private val CTA_STRIP_RE = Regex("""\[/?CTA_BUTTONS\]""", RegexOption.IGNORE_CASE)

    /** Where a brace-matched marker payload sits inside the content. */
    private data class MarkerSpan(val start: Int, val end: Int, val json: String)

    /**
     * Locates the `{…}` payload that follows [marker] by matching braces — the Kotlin twin of web's
     * `findMarkerJson` (ChatInterface.tsx).
     *
     * Brace matching rather than a regex because the block's POSITION is not fixed: another marker
     * may follow it. Braces inside JSON strings are skipped and `\"` is honoured, so a `}` in a
     * label or URL cannot end the scan early. Returns null when the braces do not balance, which is
     * a payload still arriving mid-stream — a normal outcome, not a corrupt stream.
     */
    private fun findMarkerJson(content: String, marker: String): MarkerSpan? {
        val start = content.indexOf(marker, ignoreCase = true)
        if (start < 0) return null

        var open = start + marker.length
        while (open < content.length && content[open].isWhitespace()) open++
        if (open >= content.length || content[open] != '{') return null

        var depth = 0
        var inString = false
        var escaped = false
        for (i in open until content.length) {
            val c = content[i]
            if (escaped) { escaped = false; continue }
            if (inString) {
                when (c) {
                    '\\' -> escaped = true
                    '"' -> inString = false
                }
                continue
            }
            when (c) {
                '"' -> inString = true
                '{' -> depth++
                '}' -> {
                    depth--
                    if (depth == 0) return MarkerSpan(start, i + 1, content.substring(open, i + 1))
                }
            }
        }
        return null // payload still arriving — braces do not balance yet
    }
    private val FOLLOWUPS_RE = Regex("""\[FOLLOWUPS\]([^\n]*?)(?:\[/FOLLOWUPS\]|\n|$)""", RegexOption.IGNORE_CASE)
    private val FOLLOWUPS_STRIP_RE = Regex("""\[/?FOLLOWUPS\]""", RegexOption.IGNORE_CASE)
    // P0-1. The server-built shopping DECISION block. Android does not render the decision card
    // (that is V3 UX/UI work); it must never render the block's JSON either, which is what it did
    // before this. Three layers, because one is not enough — the same lesson `[CTA_BUTTONS]`
    // taught: a closed block, an UNTERMINATED one at the tail of a streaming snapshot, and any
    // orphan tag left behind by either.
    private val SHOPPING_RE = Regex("""\[TAPPY_SHOPPING\][\s\S]*?\[/TAPPY_SHOPPING\]""", RegexOption.IGNORE_CASE)
    // End-anchored: only a trailing, still-arriving block. A mid-text open tag is left to the
    // orphan strip rather than swallowing the rest of the reply.
    private val SHOPPING_PARTIAL_RE = Regex("""\[TAPPY_SHOPPING\][\s\S]*$""", RegexOption.IGNORE_CASE)
    private val SHOPPING_STRIP_RE = Regex("""\[/?TAPPY_SHOPPING\]""", RegexOption.IGNORE_CASE)
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
        // Whatever a complete block did not consume: a truncated plan at the tail, then any
        // orphan tag. Unconditional — a reply can carry an unterminated block with no complete
        // one, which is exactly the truncated-plan case above.
        text = PLAN_PARTIAL_RE.replace(text, "").trimEnd()

        // 2. CTA buttons — closed form first, then the bare form located by brace matching.
        //
        // The strip is UNCONDITIONAL and independent of whether the payload decoded: a block we
        // cannot understand is still a block the user must not read. (Same shape parsePlan already
        // uses after its own leak.)
        var ctaPayload: String? = null
        val ctaTagMatch = CTA_TAG_RE.find(text)
        if (ctaTagMatch != null) {
            ctaPayload = ctaTagMatch.groupValues[1]
            text = CTA_TAG_RE.replace(text, "")
        } else {
            val span = findMarkerJson(text, CTA_MARKER)
            if (span != null) {
                ctaPayload = span.json
                text = text.substring(0, span.start) + text.substring(span.end)
            }
        }
        // Any FURTHER block is stripped without rendering: only the first has ever produced
        // buttons, and a leftover second block would otherwise show as raw JSON.
        var extraCta = findMarkerJson(text, CTA_MARKER)
        while (extraCta != null) {
            text = text.substring(0, extraCta.start) + text.substring(extraCta.end)
            extraCta = findMarkerJson(text, CTA_MARKER)
        }
        // Whatever brace matching declined: a block whose payload never finished arriving.
        text = CTA_PARTIAL_RE.replace(text, "").trimEnd()

        val buttons = ctaPayload?.let {
            runCatching { json.decodeFromString<CtaEnvelope>(it.trim()).buttons }.getOrNull()
        } ?: emptyList()

        // 3. Follow-up suggestion chips.
        val fuMatch = FOLLOWUPS_RE.find(text)
        val followups = fuMatch?.groupValues?.get(1)
            ?.split("|")?.map { it.trim() }?.filter { it.isNotBlank() }?.take(3)
            ?: emptyList()
        if (fuMatch != null) text = FOLLOWUPS_RE.replace(text, "")

        // 4. Shopping decision block (P0-1). Stripped, never rendered: the server emits it as a
        // `0:` text frame BEFORE the prose on a shopping turn, so an unhandled block is the first
        // thing the user reads. Closed form first, then a trailing unterminated one.
        text = SHOPPING_RE.replace(text, "")
        text = SHOPPING_PARTIAL_RE.replace(text, "")

        // Safety net: strip any orphan markers so implementation details never show. Every marker
        // the server owns is listed here — an entry missing from this line is a marker that leaks
        // the moment its block arrives in any shape the steps above did not match.
        text = PLAN_STRIP_RE.replace(text, "")
        text = CTA_STRIP_RE.replace(text, "")
        text = FOLLOWUPS_STRIP_RE.replace(text, "")
        text = SHOPPING_STRIP_RE.replace(text, "").trim()

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
