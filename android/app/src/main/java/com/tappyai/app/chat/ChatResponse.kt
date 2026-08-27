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

// ── Shopping decision (server marker `[TAPPY_SHOPPING]{…}`) ──────────────────
//
// Mirrors the server's `SynthesisView` (src/lib/ai/consultative/synthesisView.ts) and the iOS
// `ShoppingDecision` on the parity branch. Field names match the wire exactly — the payload is
// camelCase, so no @SerialName mapping is needed here (unlike TappyPlan, whose wire is snake_case).
//
// 🚨 EVERY field is nullable-with-default ON PURPOSE. The server writes `null` explicitly for a
// value it does not know ("KHONG CO DU LIEU" is modelled as JSON null, never as a fabricated 0 or
// ""), and the decision contract requires the client to show that honestly rather than invent one.
// A non-nullable field would also throw on an explicit null and silently drop the whole card.
@Serializable
data class ShoppingOffer(
    val seller: String? = null,
    val url: String? = null,
    val price: Double? = null,
    val currency: String? = null,
    val condition: String? = null,
)

/** How this configuration compares to what the user asked for: khop | khac | chua_ro. */
@Serializable
data class ShoppingEntity(
    val key: String = "",
    val config: String = "",
    val matchesRequest: String? = null,
    val recommended: Boolean? = null,
    val priceLow: Double? = null,
    val priceHigh: Double? = null,
    val image: String? = null,
    val offers: List<ShoppingOffer> = emptyList(),
)

@Serializable
data class ShoppingReason(
    val attribute: String = "",
    val evidence: String = "",
)

@Serializable
data class ShoppingRecommendation(
    val entityKey: String? = null,
    val seller: String? = null,
    val reasons: List<ShoppingReason> = emptyList(),
    val tradeOff: ShoppingReason? = null,
    val conditional: Boolean? = null,
)

@Serializable
data class ShoppingDecision(
    val v: Int = 1,
    val entities: List<ShoppingEntity> = emptyList(),
    val recommendation: ShoppingRecommendation? = null,
)

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
    val shopping: ShoppingDecision? = null,
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
    private const val CTA_MARKER = "[CTA_BUTTONS]"
    // Used only when the payload's braces do not balance (a block still streaming in).
    private val CTA_PARTIAL_RE = Regex("""\[CTA_BUTTONS\][\s\S]*$""", RegexOption.IGNORE_CASE)
    private val CTA_STRIP_RE = Regex("""\[/?CTA_BUTTONS\]""", RegexOption.IGNORE_CASE)
    private val PLAN_STRIP_RE = Regex("""\[/?TAPPY_PLAN\]""", RegexOption.IGNORE_CASE)
    private val FOLLOWUPS_RE = Regex("""\[FOLLOWUPS\]([^\n]*?)(?:\[/FOLLOWUPS\]|\n|$)""", RegexOption.IGNORE_CASE)
    private val FOLLOWUPS_STRIP_RE = Regex("""\[/?FOLLOWUPS\]""", RegexOption.IGNORE_CASE)
    // Shopping decision. Three regexes, applied in this order, mirroring the web
    // `parseShoppingMarker` (synthesisView.ts) which also handles the unclosed case:
    //   1. complete pair — the normal, fully-arrived marker;
    //   2. UNCLOSED open marker to end of text — the streaming snapshot. The web computes
    //      `end = content.length` when the close tag is absent; without this the half-arrived
    //      `[TAPPY_SHOPPING]{"v":1,"entit…` renders as raw JSON for the seconds it takes the rest
    //      of the payload to stream in. That partial leak is exactly the P0 this fixes, so it is
    //      stripped rather than shown;
    //   3. orphan half-tags — the same safety net FOLLOWUPS_STRIP_RE provides.
    private val SHOPPING_RE = Regex("""\[TAPPY_SHOPPING\]([\s\S]*?)\[/TAPPY_SHOPPING\]""", RegexOption.IGNORE_CASE)
    private val SHOPPING_PARTIAL_RE = Regex("""\[TAPPY_SHOPPING\][\s\S]*$""", RegexOption.IGNORE_CASE)
    private val SHOPPING_STRIP_RE = Regex("""\[/?TAPPY_SHOPPING\]""", RegexOption.IGNORE_CASE)

    /**
     * Shopping payloads carry explicit JSON `null` for every unknown value, so this decoder adds
     * `coerceInputValues` — without it an explicit null lands on a defaulted field and throws,
     * which would drop the whole card. Deliberately a SEPARATE instance: adding the flag to the
     * shared [json] above would change how the plan and CTA blocks decode, which is out of scope
     * for this fix.
     */
    private val shoppingJson = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }
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

        // 2. CTA buttons — closing tag first, then the bare `[CTA_BUTTONS]{…}` form.
        //
        // The bare form used to be anchored to the end of the content (`…\}\s*$`), which is how the
        // raw block leaked into a production reply: the model emits `[FOLLOWUPS]` after it, and
        // followups are parsed further down, so at THIS point something still followed the block,
        // the anchor failed and nothing was stripped. Removing the followups line later then left
        // the CTA JSON orphaned in the visible text.
        //
        // The bare form is now located by brace matching instead, so its position does not matter.
        // A simple un-anchored regex would not do: `\{[\s\S]*\}` runs greedily to the LAST brace in
        // the message and would swallow trailing prose.
        val ctaTagMatch = CTA_TAG_RE.find(text)
        var ctaBody: String? = ctaTagMatch?.groupValues?.get(1)
        if (ctaTagMatch != null) {
            text = CTA_TAG_RE.replace(text, "").trimEnd()
        } else {
            val span = findMarkerJson(text, CTA_MARKER)
            if (span != null) {
                ctaBody = span.second
                text = (text.substring(0, span.first.first) + text.substring(span.first.last + 1))
                    .trimEnd()
            } else {
                // Braces do not balance: the block is still streaming in, so nothing after it can
                // be content yet. Strip to the end rather than show a half-arrived payload — the
                // same rule the shopping marker follows.
                text = CTA_PARTIAL_RE.replace(text, "").trimEnd()
            }
        }
        val buttons = ctaBody?.let {
            runCatching { json.decodeFromString<CtaEnvelope>(it.trim()).buttons }.getOrNull()
        } ?: emptyList()

        // 2b. Shopping decision card. Runs before followups for the same reason plan runs before
        // CTA: each step strips its own block so a later regex cannot match inside it. Only the
        // FIRST marker is decoded — a reply carrying two would otherwise render two cards for one
        // decision; the rest are stripped as text by the partial/orphan passes below.
        val shopMatch = SHOPPING_RE.find(text)
        val shopping = shopMatch?.let {
            runCatching { shoppingJson.decodeFromString<ShoppingDecision>(it.groupValues[1].trim()) }
                .getOrNull()
                ?.takeIf { d -> d.entities.isNotEmpty() }
        }
        if (shopMatch != null) text = SHOPPING_RE.replace(text, "").trimEnd()
        // An unclosed marker still streaming in, then any orphan half-tag. Both strip to text so
        // no raw JSON is ever displayed, matching the always-strip rule the plan/CTA blocks follow.
        text = SHOPPING_PARTIAL_RE.replace(text, "").trimEnd()
        text = SHOPPING_STRIP_RE.replace(text, "").trimEnd()

        // 3. Follow-up suggestion chips.
        val fuMatch = FOLLOWUPS_RE.find(text)
        val followups = fuMatch?.groupValues?.get(1)
            ?.split("|")?.map { it.trim() }?.filter { it.isNotBlank() }?.take(3)
            ?: emptyList()
        if (fuMatch != null) text = FOLLOWUPS_RE.replace(text, "")

        // Safety net: strip any orphan markers so implementation details never show. CTA and PLAN
        // tags are included because a bare `[CTA_BUTTONS]` with no payload at all reaches this far
        // — findMarkerJson needs a `{` to work with, and the partial pass needs the marker to be
        // followed by something.
        text = FOLLOWUPS_STRIP_RE.replace(text, "")
        text = CTA_STRIP_RE.replace(text, "")
        text = PLAN_STRIP_RE.replace(text, "").trim()

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
            shopping = shopping,
        )
    }

    /**
     * Finds [marker] followed by a JSON object, returning the range covering marker+payload and the
     * payload itself, or null when the marker is absent or its braces do not balance.
     *
     * Brace matching rather than a regex, because the payload's position is not fixed: anchoring to
     * end-of-content is what let a real reply leak (`[FOLLOWUPS]` follows the CTA block), and an
     * un-anchored `\{[\s\S]*\}` would run greedily to the last brace in the message and swallow
     * trailing prose. Braces inside JSON strings are skipped, so a `}` in a URL or label cannot end
     * the scan early.
     */
    private fun findMarkerJson(text: String, marker: String): Pair<IntRange, String>? {
        val start = text.indexOf(marker, ignoreCase = true)
        if (start < 0) return null
        var open = start + marker.length
        while (open < text.length && text[open].isWhitespace()) open++
        if (open >= text.length || text[open] != '{') return null

        var depth = 0
        var inString = false
        var escaped = false
        for (i in open until text.length) {
            val c = text[i]
            when {
                escaped -> escaped = false
                inString && c == '\\' -> escaped = true
                c == '"' -> inString = !inString
                inString -> Unit
                c == '{' -> depth++
                c == '}' -> {
                    depth--
                    if (depth == 0) return (start..i) to text.substring(open, i + 1)
                }
            }
        }
        return null
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
