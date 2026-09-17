package com.tappyai.app.chat

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * D1 — the shopping DECISION, as it arrives inside `[TAPPY_SHOPPING]`.
 *
 * Kotlin mirror of web's `SynthesisView` (src/lib/ai/consultative/synthesisView.ts). The server
 * serialises that view directly into the marker, so this is the wire shape, not a re-derivation:
 * the config label, price range, match verdict and recommended flag are EXACTLY what the model was
 * told, which is why the card can never disagree with the prose above it.
 *
 * Android decoded none of this before. The block was stripped and thrown away, so a mobile user on
 * a shopping turn read the prose and silently lost the entire decision — the recommendation, the
 * price ranges, the match verdicts and every alternative. That is the largest functional parity gap
 * the V3 audit found (V3_PLATFORM_PARITY.md D1).
 *
 * 🚨 THE HONESTY RULE IS IN THE TYPES. Every field the server may not know is nullable, and the UI
 * renders null as an explicit "chưa rõ". Nothing here is defaulted to a plausible-looking value,
 * because a fabricated price is worse than an absent one. `buildSynthesisView` on the server groups
 * and ranks; this model and its card group NOTHING and infer NOTHING.
 */
@Serializable
data class ShoppingOfferView(
    val seller: String? = null,
    val url: String? = null,
    val price: Double? = null,
    val currency: String? = null,
    val condition: String? = null,
    /**
     * The rating THIS listing carries, never the entity's — Serper puts it on the row, so it
     * belongs to one seller's listing (web `SynthesisOfferView.rating`). Was not decoded before:
     * the wire said `rating 4.7 · 339` and the phone showed neither (UAT 2026-09-12).
     */
    val rating: Double? = null,
    @SerialName("ratingCount") val ratingCount: Int? = null,
)

/** One stated specification: the listing's own figure, never derived (web `SynthesisSpecView`). */
@Serializable
data class ShoppingSpecView(
    /** `chip` | `ram` | `storage` | `size`. */
    val key: String = "",
    /** The listing's figure — a number or a string on the wire, read as text. */
    val value: JsonPrimitive? = null,
) {
    val valueText: String? get() = value?.contentOrNull?.takeIf { it.isNotBlank() }
}

/** The seller's condition wording plus a key a dictionary can translate (web `condition`). */
@Serializable
data class ShoppingConditionView(
    val key: String? = null,
    val label: String = "",
)

/** One product configuration the assistant considered. */
@Serializable
data class ShoppingEntityView(
    val key: String = "",
    val config: String = "",
    /** `khop` = matches the request · `khac` = differs · `chua_ro` = not enough information. */
    @SerialName("matchesRequest") val matchesRequest: String = "chua_ro",
    val recommended: Boolean = false,
    @SerialName("priceLow") val priceLow: Double? = null,
    @SerialName("priceHigh") val priceHigh: Double? = null,
    /** A representative product photo, if any offer carried one. */
    val image: String? = null,
    val offers: List<ShoppingOfferView> = emptyList(),
    /** The product's own name (the listing title), when the server projected it. LAST so the
     *  positional call sites that predate it keep compiling; the card reads [displayName]. */
    val name: String? = null,
    /** The stated configuration as data, so the card can label each part (web `specs`). */
    val specs: List<ShoppingSpecView> = emptyList(),
    val condition: ShoppingConditionView? = null,
) {
    val displayName: String? get() = name?.trim()?.takeIf { it.isNotEmpty() }
}

/** Why the server recommends what it recommends. A recommendation without reasons is not shown. */
@Serializable
data class ShoppingRecommendationView(
    @SerialName("entityKey") val entityKey: String? = null,
    val seller: String? = null,
    val reasons: List<ShoppingReason> = emptyList(),
    @SerialName("tradeOff") val tradeOff: ShoppingReason? = null,
    val conditional: Boolean = false,
)

@Serializable
data class ShoppingReason(
    val attribute: String = "",
    /** The engine's own (English) wording — the fallback when the client has no sentence for it. */
    val evidence: String = "",
    /**
     * The data behind the sentence (`value`, `count`, `priceVnd`, `km`, `stars`, `minutes`), so the
     * client can SAY it in the user's language (web `reasonText`). Dropped before, which is why the
     * phone printed `rated 4.7 / 95000 VND / 339 reviews` under a Vietnamese reply.
     */
    val params: Map<String, JsonPrimitive>? = null,
) {
    fun number(name: String): Double? = params?.get(name)?.doubleOrNull
}

@Serializable
data class ShoppingDecisionView(
    val v: Int = 1,
    val entities: List<ShoppingEntityView> = emptyList(),
    val recommendation: ShoppingRecommendationView? = null,
    /**
     * The configuration the USER asked for, or `null` when they named none (web `requested`).
     *
     * A match verdict is meaningless without a request to match: `chua_ro` is emitted both when a
     * listing is unclear and when nothing was asked, so the badge is only offered when the request
     * is known. Kept as raw JSON so an OLD marker written before the field existed (key absent) is
     * told apart from an explicit `null` — web treats absent as "show" (`!== null`) and so does this.
     */
    val requested: JsonElement? = ABSENT,
) {
    /** Web: `showMatch = view.requested !== null`. */
    val showsMatchBadge: Boolean get() = requested === ABSENT || (requested != null && requested !is JsonNull)

    val requestedText: String? get() = (requested as? JsonPrimitive)?.contentOrNull
}

/**
 * Sentinel for "the key was not on the wire" (`ShoppingDecisionView.requested`). Top-level on
 * purpose: a PRIVATE companion on a `@Serializable` class hides the plugin-generated
 * `Companion.serializer()` from every other class, so `decodeFromString<ShoppingDecisionView>`
 * in the parser threw `IllegalAccessError` — swallowed by `runCatching` as "no decision" — while
 * the same call compiled inside the test source set worked (2026-09-12, 27 red tests).
 */
private val ABSENT: JsonElement = JsonPrimitive("__absent__")

/** Match verdicts the server can emit. Kept as a closed set so the UI cannot invent a fourth. */
object ShoppingMatch {
    const val EXACT = "khop"
    const val DIFFERENT = "khac"
    const val UNKNOWN = "chua_ro"
}
