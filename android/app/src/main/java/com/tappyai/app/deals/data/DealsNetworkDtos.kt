package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import kotlinx.serialization.Serializable

/** Wire DTOs for `GET /api/deals`. Field names match the backend's `Deal` shape 1:1 (already
 *  camelCase server-side — this endpoint has no snake_case columns to map). */
@Serializable
data class DealsResponseDto(val deals: List<DealDto> = emptyList())

@Serializable
data class DealDto(
    val id: String = "",
    val partnerSlug: String = "",
    val partnerName: String = "",
    val partnerType: String = "",
    val category: String = "",
    // Language-independent styling key (the vi base category). Optional so an older backend that
    // doesn't send it still parses; toDomain then falls back to [category].
    val categoryKey: String? = null,
    val title: String = "",
    val description: String? = null,
    val officialUrl: String = "",
    val bannerImage: String? = null,
    val logoImage: String? = null,
    val isFeatured: Boolean = false,
    val discountLabel: String? = null,
    val voucherCode: String? = null,
    val endAt: String? = null,
)

fun DealDto.toDomain(): Deal = Deal(
    id = id,
    partnerName = partnerName,
    category = category,
    // Fall back to the (localized) category when the backend omits categoryKey — keeps colours
    // working against an older backend, just without cross-language stability.
    categoryKey = categoryKey?.takeIf { it.isNotBlank() } ?: category,
    title = title,
    description = description,
    officialUrl = officialUrl,
    logoImage = logoImage,
    discountLabel = discountLabel,
    voucherCode = voucherCode,
    endAt = endAt,
)
