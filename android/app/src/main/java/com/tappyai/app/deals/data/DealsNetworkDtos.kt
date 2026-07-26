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
    title = title,
    description = description,
    officialUrl = officialUrl,
    logoImage = logoImage,
    discountLabel = discountLabel,
    voucherCode = voucherCode,
    endAt = endAt,
)
