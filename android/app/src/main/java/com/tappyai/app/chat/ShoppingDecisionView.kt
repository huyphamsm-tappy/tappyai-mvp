package com.tappyai.app.chat

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
)

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
    val evidence: String = "",
)

@Serializable
data class ShoppingDecisionView(
    val v: Int = 1,
    val entities: List<ShoppingEntityView> = emptyList(),
    val recommendation: ShoppingRecommendationView? = null,
)

/** Match verdicts the server can emit. Kept as a closed set so the UI cannot invent a fourth. */
object ShoppingMatch {
    const val EXACT = "khop"
    const val DIFFERENT = "khac"
    const val UNKNOWN = "chua_ro"
}
