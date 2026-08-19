package com.tappyai.app.deals

/**
 * One curated deal card, mapped from the `partner_deals` feed (`GET /api/deals`).
 *
 * Only what this screen renders: [source] is the partner brand ("via Shopee"), [url] its official
 * https link, [discount] the optional promo callout (null on a deal with no promotion — most of
 * them). The feed carries no emoji or badge concept, so neither exists here.
 */
data class Deal(
    val title: String,
    val category: String,
    val discount: String?,
    val url: String,
    val source: String,
)

/**
 * Collision-free LazyColumn keys for [deals], positionally aligned with the list.
 *
 * [Deal.url] is the natural identity here, but it is NOT guaranteed unique: it decodes from
 * `DealDto.officialUrl`, which defaults to `""`, so any field the backend stops sending decodes
 * every deal to the same blank url, and two blank keys make Compose throw
 * `IllegalArgumentException: Key "" was already used` at measure time — the whole tab dies before
 * it draws a frame. Two deals can also legitimately point at one partner URL.
 *
 * So: a url that is non-blank and unique is used as-is (keys stay stable across reloads and
 * reorders, which is the entire point of passing `key`); repeats get a deterministic occurrence
 * suffix, and blanks fall back to their index. Total and deterministic — never throws, and equal
 * input always yields equal keys.
 */
fun dealListKeys(deals: List<Deal>): List<String> {
    val occurrences = mutableMapOf<String, Int>()
    return deals.mapIndexed { index, deal ->
        val url = deal.url.trim()
        if (url.isEmpty()) {
            // No identity to preserve — index is the only thing that distinguishes these.
            "deal-index:$index"
        } else {
            val seen = occurrences.getOrDefault(url, 0) + 1
            occurrences[url] = seen
            if (seen == 1) url else "$url#$seen"
        }
    }
}
