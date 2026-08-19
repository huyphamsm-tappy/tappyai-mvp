package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `GET /api/deals` — the admin-managed `partner_deals` feed (web
 * `src/lib/deals/partnerDeals.ts`, `PartnerDeal`). Field names are the backend's camelCase 1:1.
 *
 * These names are NOT cosmetic. The shared [kotlinx.serialization.json.Json] runs with
 * `ignoreUnknownKeys = true` (core:network), so a name that does not match is not an error — it
 * silently decodes to the declared default. That is exactly how this screen broke: the DTO still
 * declared the retired hardcoded-pool shape (`url`, `discount`, `source`, `emoji`, `badge`), none
 * of which the feed sends any more, so every deal decoded with a blank url. `DealsWireContractTest`
 * pins these names against a real captured response.
 *
 * Only the fields this screen actually renders are declared; the rest of the contract
 * (`id`, `description`, `logoImage`, `voucherCode`, `endAt`, …) is deliberately ignored.
 */
@Serializable
data class DealsResponseDto(val deals: List<DealDto> = emptyList())

@Serializable
data class DealDto(
    val title: String = "",
    /** Localized display label — follows the request locale. */
    val category: String = "",
    /** Promo callout, e.g. "-50%". Genuinely absent on most deals, hence nullable. */
    val discountLabel: String? = null,
    /** The partner's own https link — what tapping a card opens. */
    val officialUrl: String = "",
    /** Brand name shown as the deal's source ("via Shopee"). */
    val partnerName: String = "",
)

fun DealDto.toDomain(): Deal = Deal(
    title = title,
    category = category,
    discount = discountLabel,
    url = officialUrl,
    source = partnerName,
)
