package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import kotlinx.serialization.Serializable

/**
 * Wire DTOs for `GET /api/deals` — the admin-managed `partner_deals` feed (web
 * `src/lib/deals/partnerDeals.ts`, `PartnerDeal`). Field names are the backend's camelCase 1:1.
 *
 * 🚨 These names are NOT cosmetic. The shared [kotlinx.serialization.json.Json] runs with
 * `ignoreUnknownKeys = true` (core:network), so a name that does not match is not an error — it
 * silently decodes to the declared default. That is exactly how this screen broke: the DTO still
 * declared the retired hardcoded-pool shape (`url`, `discount`, `source`, `emoji`, `badge`), none
 * of which the feed sends any more, so every deal decoded with a blank url and Compose crashed on
 * duplicate keys. `DealsWireContractTest` pins these names against a real captured response.
 *
 * Every field the card renders is declared. `partnerSlug`, `partnerType`, `bannerImage` and
 * `isFeatured` are deliberately ignored — the card has no place for them.
 */
@Serializable
data class DealsResponseDto(val deals: List<DealDto> = emptyList())

@Serializable
data class DealDto(
    /** Stable identity, used for the lazy-list key. */
    val id: String = "",
    /** Brand name shown as the deal's attribution ("via Shopee"). */
    val partnerName: String = "",
    /** Localized display label — follows the request locale. */
    val category: String = "",
    /**
     * Language-independent styling key.
     *
     * 🔑 Separate from [category] on purpose: the chip's colour is keyed on the Vietnamese base
     * label, so colouring from the localized label would drop every colour in English.
     */
    val categoryKey: String = "",
    val title: String = "",
    /** The one field carrying real copy on today's feed — the card is bare without it. */
    val description: String? = null,
    /** The partner's own https link — what tapping a card opens. */
    val officialUrl: String = "",
    /** Absent on every current row; the card falls back to an initial tile. */
    val logoImage: String? = null,
    /** Promo callout, e.g. "-50%". Absent on every current row. */
    val discountLabel: String? = null,
    /** Copyable promo code. Absent on every current row. */
    val voucherCode: String? = null,
    /** ISO-8601 expiry that drives the countdown. Absent on every current row. */
    val endAt: String? = null,
)

fun DealDto.toDomain(): Deal = Deal(
    id = id,
    partnerName = partnerName,
    category = category,
    // The feed sends categoryKey, but an older row (or a partial response) may not. Falling back
    // to the localized label keeps the colour working in Vietnamese instead of dropping it for
    // everyone, which is what an empty key would do.
    categoryKey = categoryKey.ifBlank { category },
    title = title,
    description = description?.takeIf { it.isNotBlank() },
    officialUrl = officialUrl,
    logoImage = logoImage?.takeIf { it.isNotBlank() },
    discountLabel = discountLabel?.takeIf { it.isNotBlank() },
    voucherCode = voucherCode?.takeIf { it.isNotBlank() },
    endAt = endAt?.takeIf { it.isNotBlank() },
)
