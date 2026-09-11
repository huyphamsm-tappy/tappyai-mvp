package com.tappyai.app.share

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The recommendation card's data, as the web `PlacesLiveView` annotation carries it.
 *
 * 🚨 WHY ANDROID NOW READS THE `8:` FRAME. The stream's text (`0:`) carries the reply's prose
 * with photos and search links injected; it does NOT carry phone, opening hours, a Maps link,
 * or a structured rating per venue — measured on a live food turn 2026-09-11. The `a:` tool
 * result carries rows, but PRE-admission: before the domain boundary, before stay dedupe,
 * before actions are built. `8:` is the post-admission, ranked, deduped view — the exact object
 * the web shares — so consuming it is what makes an Android brochure equal to the web's rather
 * than a poorer copy built from prose.
 *
 * 🚨 IN MEMORY ONLY. The web never persists this frame (Places/Maps data is live-only), and
 * neither may Android: it lives on the [com.tappyai.app.chat.ChatMessage] for the session and is
 * NOT part of the persisted conversation DTO.
 *
 * Parsed by field name with unknown keys ignored, so the wire can grow without breaking
 * this client — the same tolerance `readPlacesLiveView` shows on the web.
 */
data class PlacesLiveView(
    val domain: String,
    val items: List<LivePlace>,
)

data class LivePlace(
    val name: String,
    val image: String? = null,
    val address: String? = null,
    val rating: Double? = null,
    val ratingCount: Int? = null,
    val openingHours: String? = null,
    val openNow: Boolean? = null,
    val phone: String? = null,
    val priceRangeText: String? = null,
    val categories: List<String> = emptyList(),
    val reasons: List<String> = emptyList(),
    val actions: List<LiveAction> = emptyList(),
)

data class LiveAction(
    val kind: String,
    val urlKind: String,
    val url: String,
    val platform: String? = null,
    val attributed: Boolean? = null,
)

object PlacesLiveViewParser {
    const val ANNOTATION_KIND = "tappy.places.v1"

    /**
     * One stream line → the view, or null when the line is not the places annotation.
     *
     * The AI SDK writes annotations as `8:[{…},{…}]`; the places view is the element whose
     * `kind` is [ANNOTATION_KIND]. Anything malformed degrades to null, never throws — a bad
     * frame must cost the card, not the reply.
     */
    fun fromStreamLine(line: String, json: Json = lenient): PlacesLiveView? {
        val stripped = if (line.startsWith("data: ")) line.removePrefix("data: ") else line
        if (!stripped.startsWith("8:")) return null
        return try {
            val root = json.parseToJsonElement(stripped.removePrefix("8:"))
            val candidates: List<JsonElement> = when (root) {
                is JsonArray -> root
                is JsonObject -> listOf(root)
                else -> emptyList()
            }
            candidates.asSequence()
                .mapNotNull { it as? JsonObject }
                .firstOrNull { it["kind"]?.jsonPrimitive?.contentOrNull == ANNOTATION_KIND }
                ?.let(::parseView)
        } catch (_: Exception) {
            null
        }
    }

    private fun parseView(o: JsonObject): PlacesLiveView? {
        val items = (o["items"] as? JsonArray)?.mapNotNull { (it as? JsonObject)?.let(::parsePlace) }.orEmpty()
        if (items.isEmpty()) return null
        return PlacesLiveView(
            domain = o["domain"]?.jsonPrimitive?.contentOrNull ?: "food",
            items = items,
        )
    }

    private fun parsePlace(o: JsonObject): LivePlace? {
        val name = o["name"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
        if (name.isEmpty()) return null
        return LivePlace(
            name = name,
            image = o.str("image"),
            address = o.str("address"),
            rating = o["rating"]?.jsonPrimitive?.doubleOrNull,
            ratingCount = o["ratingCount"]?.jsonPrimitive?.intOrNull,
            openingHours = o.str("openingHours"),
            openNow = o["openNow"]?.jsonPrimitive?.booleanOrNull,
            phone = o.str("phone"),
            priceRangeText = o.str("priceRangeText"),
            categories = o.strList("categories"),
            reasons = (o["reasons"] as? JsonArray)
                ?.mapNotNull { (it as? JsonObject)?.get("evidence")?.jsonPrimitive?.contentOrNull }
                .orEmpty(),
            actions = (o["actions"] as? JsonArray)?.mapNotNull { el ->
                val a = el as? JsonObject ?: return@mapNotNull null
                val kind = a.str("kind") ?: return@mapNotNull null
                val url = a.str("url") ?: return@mapNotNull null
                LiveAction(
                    kind = kind,
                    urlKind = a.str("urlKind") ?: "direct",
                    url = url,
                    platform = a.str("platform"),
                    attributed = a["attributed"]?.jsonPrimitive?.booleanOrNull,
                )
            }.orEmpty(),
        )
    }

    private fun JsonObject.str(key: String): String? =
        (this[key] as? JsonElement)?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }?.takeIf { it.isNotBlank() }

    private fun JsonObject.strList(key: String): List<String> =
        (this[key] as? JsonArray)?.mapNotNull { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }.orEmpty()

    private val lenient = Json { ignoreUnknownKeys = true; isLenient = true }

    // Kept for callers that already hold a JsonArray (tests).
    @Suppress("unused")
    internal fun fromAnnotations(arr: JsonArray): PlacesLiveView? =
        arr.asSequence().mapNotNull { it as? JsonObject }
            .firstOrNull { it["kind"]?.jsonPrimitive?.contentOrNull == ANNOTATION_KIND }?.let(::parseView)

    @Suppress("unused")
    private fun JsonElement.asArrayOrNull(): JsonArray? = runCatching { jsonArray }.getOrNull()

    @Suppress("unused")
    private fun JsonElement.asObjectOrNull(): JsonObject? = runCatching { jsonObject }.getOrNull()
}
