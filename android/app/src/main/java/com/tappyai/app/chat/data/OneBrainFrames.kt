package com.tappyai.app.chat.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import java.net.URI

// A3 (02/11): the one-brain stream's annotations, re-checked the way the web client re-checks them (web branch, frozen at f4b07d2):
// readResearchStatus / readResearchCharts (src/lib/ai/research/deepResearch.ts), sanitizeDocMedia (src/lib/answerDoc/media.ts), the turn
// status (src/lib/ai/streamEnrichment.ts). The server already checked all of it; the client trusts nothing it would show.

/** The Deep Research card: the plan's title, its steps, the source count and (once done) the cited sources. */
data class ResearchStatus(val title: String, val phase: String, val steps: List<ResearchStep>, val sources: Int, val links: List<ResearchLink> = emptyList())
data class ResearchStep(val title: String, val status: String)
data class ResearchLink(val id: Int, val title: String, val url: String)

/** One chart of a report section, drawn by the client from figures the server checked in their own source. */
data class ResearchChart(val section: String, val title: String, val unit: String, val kind: String, val points: List<ChartPoint>)
data class ChartPoint(val label: String, val value: Double, val source: Int)

/** A picture of the answer (a report section, an item of a list answer): it goes under the heading whose title it carries. */
data class DocMediaItem(val title: String, val src: String, val source: String)

internal object OneBrainFrames {
    const val RESEARCH_TYPE = "tappy.research.v1"
    const val CHARTS_TYPE = "tappy.research_charts.v1"
    const val DOC_MEDIA_KIND = "tappy.doc_media.v1"
    const val TURN_STATUS_KIND = "tappy.turn_status.v1"

    private val PHASES = setOf("planning", "researching", "writing", "done", "failed")
    private val STEP_STATUSES = setOf("pending", "running", "done", "failed")
    private const val MAX_STEPS = 7
    private const val MAX_LINKS = 40
    private const val MAX_CHARTS = 4
    private const val MAX_CHART_POINTS = 12
    private const val MAX_MEDIA = 8

    fun research(o: JsonObject): ResearchStatus? {
        val phase = o.str("phase")?.takeIf { it in PHASES } ?: return null
        val steps = o.arr("steps").mapNotNull { s ->
            val so = s as? JsonObject ?: return@mapNotNull null
            val title = so.str("title") ?: return@mapNotNull null
            val status = so.str("status")?.takeIf { it in STEP_STATUSES } ?: return@mapNotNull null
            ResearchStep(title.take(160), status)
        }.take(MAX_STEPS)
        val links = o.arr("links").mapNotNull { l ->
            val lo = l as? JsonObject ?: return@mapNotNull null
            val id = lo.num("id")?.toInt() ?: return@mapNotNull null
            val title = lo.str("title") ?: return@mapNotNull null
            val url = lo.str("url")?.takeIf(::isSafeHttpsUrl) ?: return@mapNotNull null
            ResearchLink(id, title.take(200), url)
        }.take(MAX_LINKS)
        val sources = o.num("sources")?.takeIf { it >= 0 }?.toInt() ?: 0
        return ResearchStatus(o.str("title")?.take(160).orEmpty(), phase, steps, sources, links)
    }

    fun charts(o: JsonObject): List<ResearchChart> = o.arr("charts").mapNotNull { c ->
        val co = c as? JsonObject ?: return@mapNotNull null
        val points = co.arr("points").mapNotNull { p ->
            val po = p as? JsonObject ?: return@mapNotNull null
            val label = po.str("label") ?: return@mapNotNull null
            val value = po.num("value")?.takeIf { it.isFinite() } ?: return@mapNotNull null
            val source = po.num("source")?.toInt() ?: return@mapNotNull null
            ChartPoint(clean(label, 40), value, source)
        }.take(MAX_CHART_POINTS)
        val section = co.str("section") ?: return@mapNotNull null
        val title = co.str("title") ?: return@mapNotNull null
        if (points.size < 2) return@mapNotNull null
        ResearchChart(clean(section, 80), clean(title, 80), clean(co.str("unit").orEmpty(), 24), if (co.str("kind") == "line") "line" else "bar", points)
    }.take(MAX_CHARTS)

    fun docMedia(o: JsonObject): List<DocMediaItem> {
        if (o.num("v") != 1.0) return emptyList()
        return o.arr("items").mapNotNull { i ->
            val io = i as? JsonObject ?: return@mapNotNull null
            val title = clean(io.str("title").orEmpty(), 80).takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val src = io.str("src")?.takeIf { it.length <= 2048 && isSafeHttpsUrl(it) } ?: return@mapNotNull null
            DocMediaItem(title, src, if (io.str("source") == "wikipedia") "wikipedia" else "web")
        }.take(MAX_MEDIA)
    }

    fun turnStatus(o: JsonObject): String? = o.str("status")?.takeIf { it == "incomplete" || it == "interrupted" }

    /** The web's `isSafeHttpsUrl` (src/lib/security/urlGuard.ts): https, a host, no credentials, not an internal or private address. */
    fun isSafeHttpsUrl(raw: String): Boolean {
        val u = runCatching { URI(raw) }.getOrNull() ?: return false
        if (!u.scheme.equals("https", ignoreCase = true) || u.rawUserInfo != null) return false
        val h = u.host?.lowercase()?.removePrefix("[")?.removeSuffix("]") ?: return false
        if (h.isEmpty() || h == "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false
        if (h.matches(Regex("""\d+\.\d+\.\d+\.\d+"""))) {
            val (a, b) = h.split('.').map { it.toInt() }
            if (a == 0 || a == 10 || a == 127 || (a == 169 && b == 254) || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 100 && b in 64..127)) return false
        }
        if (':' in h && (h == "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80"))) return false
        return true
    }

    private fun clean(s: String, max: Int) = s.replace(Regex("""\s+"""), " ").trim().take(max)
    private fun JsonObject.str(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
    private fun JsonObject.num(k: String): Double? = (this[k] as? JsonPrimitive)?.takeIf { !it.isString && it.booleanOrNull == null }?.doubleOrNull
    private fun JsonObject.arr(k: String): JsonArray = this[k] as? JsonArray ?: JsonArray(emptyList())
}
