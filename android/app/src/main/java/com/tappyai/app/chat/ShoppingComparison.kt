package com.tappyai.app.chat

/**
 * P4-06 — the comparison Android renders, derived from the decision the reply already carried.
 *
 * Kotlin twin of web's `comparisonFromSynthesis.ts`. Impact class A: the shopping marker already
 * delivers every entity, its price range, its verdict and the server's recommendation, so a
 * comparison is a different PRESENTATION of the same payload and asks the backend for nothing new.
 *
 * 🚨 IT DERIVES, IT DOES NOT INFER. Each attribute is a restatement of a field the server supplied
 * and is already shown by [ShoppingDecisionCard]:
 *
 *     Giá      ← priceLow / priceHigh
 *     Khớp     ← matchesRequest
 *     Nơi bán  ← offers.size
 *
 * Nothing is ranked, scored or averaged. There is deliberately no "cheapest" attribute: that would
 * be the client forming an opinion the server did not state.
 *
 * Kept as pure Kotlin, separate from the composable, so the rules are testable without Compose.
 */

/** One column of the comparison. */
data class ComparisonEntity(
    val key: String,
    val label: String,
    /** Attribute key → value. `null` means genuinely unknown, never "none" and never zero. */
    val values: Map<String, String?>,
)

data class ComparisonAttribute(val key: String, val label: String)

data class ShoppingComparison(
    val entities: List<ComparisonEntity>,
    val attributes: List<ComparisonAttribute>,
    /** Null unless the server both recommended something AND said why (DD-005). */
    val recommendedKey: String?,
    val reason: String?,
)

/** DD-005 caps. Beyond these, comparison stops helping. */
const val COMPARISON_MAX_ENTITIES = 4
const val COMPARISON_MAX_ATTRIBUTES = 6

/** Labels the caller resolves from resources, so this file stays free of Android dependencies. */
data class ComparisonLabels(
    val price: String,
    val match: String,
    val sellers: String,
    val unknown: String,
    val matchExact: String,
    val matchDifferent: String,
    val matchUnknown: String,
    /** Formats a seller count, e.g. "3 nơi bán". */
    val sellerCount: (Int) -> String,
    /** Formats a price range; must render an absent range as [unknown]. */
    val priceRange: (Double?, Double?) -> String,
)

/**
 * Projects a decision into a comparison, or null when there is nothing to compare.
 *
 * Returns null below two entities: one option is not a comparison, and offering the control would
 * promise a decision aid that cannot exist.
 */
fun shoppingComparisonFrom(view: ShoppingDecisionView?, labels: ComparisonLabels): ShoppingComparison? {
    val source = view?.entities.orEmpty().take(COMPARISON_MAX_ENTITIES)
    if (source.size < 2) return null

    fun matchLabel(m: String) = when (m) {
        ShoppingMatch.EXACT -> labels.matchExact
        ShoppingMatch.DIFFERENT -> labels.matchDifferent
        else -> labels.matchUnknown
    }

    val entities = source.map { e ->
        ComparisonEntity(
            key = e.key,
            label = e.config,
            values = mapOf(
                "price" to labels.priceRange(e.priceLow, e.priceHigh),
                "match" to matchLabel(e.matchesRequest),
                // No offers is unknown territory, not "0 sellers".
                "sellers" to e.offers.size.takeIf { it > 0 }?.let(labels.sellerCount),
            ),
        )
    }

    val attributes = listOf(
        ComparisonAttribute("price", labels.price),
        ComparisonAttribute("match", labels.match),
        ComparisonAttribute("sellers", labels.sellers),
    ).take(COMPARISON_MAX_ATTRIBUTES)

    // DD-005 enforced here, not in the UI: a marked winner with nothing to justify it is
    // unreachable by construction.
    val recommended = source.firstOrNull { it.recommended }
    val rec = view?.recommendation
    val reasons = if (rec != null && recommended != null && rec.entityKey == recommended.key) rec.reasons else emptyList()
    val reason = reasons.mapNotNull { it.evidence.takeIf(String::isNotBlank) }
        .joinToString(" · ")
        .takeIf { it.isNotBlank() }

    return ShoppingComparison(
        entities = entities,
        attributes = attributes,
        recommendedKey = if (reason != null) recommended?.key else null,
        reason = reason,
    )
}

/**
 * Splits attributes into the ones that differ and the ones identical for every entity.
 *
 * Same three rules as web: an attribute nobody has a value for is dropped entirely; an attribute
 * every entity shares is folded away so the differences are what the eye lands on; a partially
 * unknown attribute counts as DIFFERING, because calling it "the same for all" would be a claim
 * the data does not support.
 */
fun partitionComparisonAttributes(
    entities: List<ComparisonEntity>,
    attributes: List<ComparisonAttribute>,
): Pair<List<ComparisonAttribute>, List<ComparisonAttribute>> {
    val differing = mutableListOf<ComparisonAttribute>()
    val identical = mutableListOf<ComparisonAttribute>()
    for (attr in attributes) {
        val raw = entities.map { it.values[attr.key] }
        val known = raw.filterNotNull().filter { it.isNotBlank() }
        if (known.isEmpty()) continue
        if (known.size == entities.size && known.all { it == known[0] }) identical += attr else differing += attr
    }
    return differing.take(COMPARISON_MAX_ATTRIBUTES) to identical
}
