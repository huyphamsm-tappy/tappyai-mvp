package com.tappyai.app.chat

import java.net.URL

/**
 * Where an offer's link ACTUALLY goes, and whether it is the product itself — the Kotlin twin of
 * web's `offerDestination` (src/components/chat/structured/OfferRow.tsx).
 *
 * 🚨 A SELLER NAME BESIDE A GOOGLE LINK READS AS A PROMISE. Serper's /shopping rows name a merchant
 * ("Shopee", "CellphoneS") but their `link` is a `google.com/search?...prds=` redirect (40/40 on a
 * live query). Labelling that "Xem" ("view the product") is a false impression. This classifier
 * drives the honest label AND the shopping_search_click gate, and MUST stay in lockstep with web —
 * the shared cases are pinned by OfferDestinationTest / OfferRow.tsx.
 */
data class OfferDestination(
    /** The site the link opens — "Shopee", "Google". Null when unparseable. */
    val platform: String?,
    /** True when the URL addresses one product; false for a search or listing. */
    val direct: Boolean,
    /** True when that site is the seller this row names. */
    val isSeller: Boolean,
)

/** The label branch, mirroring web's `offerActionLabel`. Maps to the R.string.* below. */
enum class OfferLabelKind { VIEW, VIEW_ON, VIEW_ON_SEARCH }

/** Path segments that mean "a list of results", not one product (web `SEARCH_PATH`). */
private val SEARCH_PATH = Regex("""/search|/tim-kiem|/catalog|/s\b""")

fun offerDestination(url: String?, seller: String?): OfferDestination? {
    if (url.isNullOrBlank()) return null
    val parsed = try { URL(url) } catch (e: Exception) { return null }
    val host = (parsed.host ?: "").removePrefix("www.")
    if (host.isBlank()) return null
    val path = parsed.path ?: ""
    // web reads `u.search` (with "?"), so `query.length > 1` there == a non-empty query here.
    val query = parsed.query ?: ""

    val brand = host.substringBefore('.')
    val platform = if (brand.isEmpty()) null else brand.replaceFirstChar { it.uppercaseChar() }
    val normalisedSeller = (seller ?: "").lowercase().replace(Regex("[^a-z0-9]"), "")
    val isSeller = normalisedSeller.isNotEmpty() && brand.isNotEmpty() &&
        (normalisedSeller.contains(brand) || brand.contains(normalisedSeller))

    // A product page names the product in its PATH. A search names it in a QUERY — which is exactly
    // the shape of the Google Shopping redirect.
    val isSearch = SEARCH_PATH.containsMatchIn(path) || query.isNotEmpty()
    val direct = !isSearch && path.trimEnd('/').length > 1

    return OfferDestination(platform, direct, isSeller)
}

/** The label an offer's button has earned — the same branching as web's `offerActionLabel`. */
fun offerLabelKind(dest: OfferDestination?): OfferLabelKind = when {
    dest?.platform == null -> OfferLabelKind.VIEW
    dest.direct && dest.isSeller -> OfferLabelKind.VIEW
    dest.direct -> OfferLabelKind.VIEW_ON
    else -> OfferLabelKind.VIEW_ON_SEARCH
}
