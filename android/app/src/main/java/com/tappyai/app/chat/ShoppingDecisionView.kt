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

/**
 * A Commerce Link the platform attached to a product entity (web `SynthesisCommerceView`,
 * src/lib/ai/consultative/synthesisView.ts). The Shopping card renders from the
 * `[TAPPY_SHOPPING]` marker rather than the live place view, so the same canonical handoff is
 * projected here with the same facts: merchant, depth, login boundary, the RESOLVED [labelKey] and
 * the opaque ids the handoff beacon reports.
 *
 * 🚨 ANDROID DECODED NONE OF THIS BEFORE. `ignoreUnknownKeys` dropped `commerceLinks` on the
 * floor, so "Mua iPhone trên TikTok Shop" showed the web its TikTok Shop handoff and showed the
 * phone a Google Shopping redirect list. Same marker, two different merchants — the drift the
 * shared fixtures (shared/ccp/commerce-action-fixtures.json) now pin.
 */
@Serializable
data class ShoppingCommerceView(
    @SerialName("linkId") val linkId: String = "",
    @SerialName("requestId") val requestId: String = "",
    @SerialName("providerId") val providerId: String = "",
    @SerialName("merchantName") val merchantName: String = "",
    val url: String = "",
    val depth: Int = 0,
    @SerialName("guestDepth") val guestDepth: Int = 0,
    @SerialName("authRequiredAt") val authRequiredAt: String = "",
    @SerialName("loginRequired") val loginRequired: Boolean = false,
    @SerialName("freshnessType") val freshnessType: String = "",
    @SerialName("expiresAt") val expiresAt: String? = null,
    val tracked: Boolean = false,
    val capability: String? = null,
    val primary: Boolean = true,
    /** `SEARCH_HANDOFF` (the merchant's search for the user's words) vs a detail / checkout handoff. */
    val kind: String = "",
    /** The RESOLVED label key. Null on a marker written before the field existed (see [labelKeyOrFallback]). */
    @SerialName("labelKey") val labelKey: String? = null,
    val handoff: String? = null,
    @SerialName("authenticatedDepth") val authenticatedDepth: Int? = null,
    val facts: LiveCommerceObservedFacts? = null,
) {
    val isSearch: Boolean get() = kind == "SEARCH_HANDOFF"

    /**
     * A marker persisted before the server projected `labelKey` still renders an honest label: a
     * search says "search on", a detail handoff says "view on" — never a stronger verb than the
     * server chose (the resolver on the server is the only thing allowed to promise a purchase).
     */
    val labelKeyOrFallback: String
        get() = labelKey ?: if (isSearch) "v3.action.searchOn" else "v3.action.viewOn"

    /** The same action shape the live place card renders, so one label resolver serves both. */
    fun asPlaceCardAction(): PlaceCardAction = PlaceCardAction(
        kind = "purchase",
        urlKind = if (isSearch) "search" else "direct",
        url = url,
        labelKey = labelKeyOrFallback,
        platform = merchantName,
        commerce = LiveCommerceFacts(
            linkId = linkId, requestId = requestId, providerId = providerId, depth = depth, guestDepth = guestDepth,
            authRequiredAt = authRequiredAt, loginRequired = loginRequired, handoff = handoff,
            authenticatedDepth = authenticatedDepth, freshnessType = freshnessType, expiresAt = expiresAt,
            tracked = tracked, capability = capability, primary = primary, facts = facts,
        ),
    )
}

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
    /** The entity's leading DETAIL handoff (a stored marker from before [commerceLinks] carries only this). */
    val commerce: ShoppingCommerceView? = null,
    /** Every Commerce Link CCP attached, in CCP's ranking order. */
    @SerialName("commerceLinks") val commerceLinks: List<ShoppingCommerceView>? = null,
) {
    val displayName: String? get() = name?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * The handoffs the card shows, split the way web splits them (`handoffsOf`,
     * components/chat/ShoppingDecision.tsx): DETAIL links are the buttons; the marketplaces' SEARCH
     * fallbacks are offered only when the entity has no detail link at all.
     */
    val commerceHandoffs: ShoppingCommerceHandoffs
        get() {
            val all = commerceLinks ?: listOfNotNull(commerce)
            val detail = all.filter { !it.isSearch }.take(5)
            val search = if (detail.isNotEmpty()) emptyList() else all.filter { it.isSearch }.take(2)
            return ShoppingCommerceHandoffs(detail, search)
        }
}

data class ShoppingCommerceHandoffs(val detail: List<ShoppingCommerceView>, val search: List<ShoppingCommerceView>) {
    val isEmpty: Boolean get() = detail.isEmpty() && search.isEmpty()
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
