package com.tappyai.app.deals

/**
 * One curated deal card, mapped from the `partner_deals` feed (`GET /api/deals`).
 *
 * Mirrors what the web card renders (`src/app/deals/DealsView.tsx` → `DealCard`): a logo tile, the
 * title, an optional discount badge, a coloured category chip, an optional countdown, the
 * description, an optional voucher chip, and the "via {partner}" attribution.
 *
 * 🔑 [category] is the LOCALIZED display label and [categoryKey] is the language-independent
 * styling key. They are separate because the colour map is keyed on the Vietnamese base label; if
 * the chip were coloured from [category], every category would lose its colour the moment the user
 * switched the app to English.
 *
 * Optional fields are genuinely optional in the feed: on the current production data every
 * [discountLabel], [voucherCode], [endAt] and [logoImage] is null, so each of those must render as
 * absent rather than as an empty box.
 */
data class Deal(
    val id: String,
    val partnerName: String,
    val category: String,
    val categoryKey: String,
    val title: String,
    val description: String?,
    val officialUrl: String,
    val logoImage: String?,
    val discountLabel: String?,
    val voucherCode: String?,
    val endAt: String?,
)

/**
 * Collision-free LazyColumn keys for [deals], positionally aligned with the list.
 *
 * 🚨 This exists because of a real crash, and the crash is worth keeping in mind before anyone
 * simplifies it back to `key = { it.id }`. Every field here decodes with a default — `id` defaults
 * to `""` exactly as `officialUrl` does — so ANY field the backend stops sending decodes every deal
 * to the same blank value, and two blank keys make Compose throw
 * `IllegalArgumentException: Key "" was already used` at measure time. The whole tab dies before it
 * draws a frame. That is precisely how this screen broke once, on `officialUrl`.
 *
 * So identity is taken from `id`, falling back to `officialUrl`, and then made total: a value that
 * is non-blank and unique is used as-is (keys stay stable across reloads and reorders, which is the
 * entire point of passing `key`); repeats get a deterministic occurrence suffix; blanks fall back
 * to their index. Never throws, and equal input always yields equal keys.
 */
fun dealListKeys(deals: List<Deal>): List<String> {
    val occurrences = mutableMapOf<String, Int>()
    return deals.mapIndexed { index, deal ->
        val identity = deal.id.trim().ifEmpty { deal.officialUrl.trim() }
        if (identity.isEmpty()) {
            // No identity to preserve — index is the only thing that distinguishes these.
            "deal-index:$index"
        } else {
            val seen = occurrences.getOrDefault(identity, 0) + 1
            occurrences[identity] = seen
            if (seen == 1) identity else "$identity#$seen"
        }
    }
}
