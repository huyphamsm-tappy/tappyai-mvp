package com.tappyai.app.chat

import kotlinx.serialization.Serializable
import java.text.NumberFormat
import java.util.Locale

// Owner 01/11 (Android = the web): the facts a shopping row carries that the web shows (components/chat/ShoppingDecision.tsx) and Android did not read -
// the rating of the offer the row features, the stated specs and the seller's condition. The server writes them into the marker (SynthesisView); this
// derives nothing: a field the server did not send shows nothing.

/** One stated specification: the key the server gave ("chip", "ram", "storage", "size") and the listing's own figure as text. */
@Serializable
data class ShoppingSpecView(val key: String = "", val value: String = "")

/** The seller's own condition wording, plus a key a dictionary can translate (null = no entry: the wording stands). */
@Serializable
data class ShoppingConditionView(val key: String? = null, val label: String = "")

/** The offer a row features: the recommended seller's own when it has one, else the first (web `featuredOffer`). */
internal fun featuredOffer(e: ShoppingEntityView, seller: String? = null): ShoppingOfferView? {
    if (seller != null) e.offers.firstOrNull { it.seller != null && it.seller == seller }?.let { return it }
    return e.offers.firstOrNull()
}

/** A rating as the reader's language writes it: [value] ("4.5") and, when the listing carries a review count, [count] ("1.234" / "1,234"). */
data class RatingFacts(val value: String, val count: String?)

/** The featured listing's own rating; nothing when it has none (the entity has no rating of its own). */
internal fun ratingFacts(rating: Double?, count: Int?, lang: String): RatingFacts? {
    if (rating == null) return null
    val value = if (rating % 1.0 == 0.0) rating.toInt().toString() else rating.toString()
    val grouped = count?.takeIf { it > 0 }?.let { NumberFormat.getIntegerInstance(if (lang == "vi") Locale("vi", "VN") else Locale.US).format(it) }
    return RatingFacts(value, grouped)
}

/** The chips under a row: each stated spec labelled by [spec], then the seller's condition ([condition] for a key it knows, else the seller's own wording). */
internal fun specChips(e: ShoppingEntityView, spec: (key: String, value: String) -> String, condition: (key: String) -> String?): List<String> {
    val specs = e.specs.map { spec(it.key, it.value) }
    val cond = e.condition?.let { c -> (c.key?.let(condition)) ?: c.label }
    return (specs + listOfNotNull(cond)).filter { it.isNotBlank() }
}
