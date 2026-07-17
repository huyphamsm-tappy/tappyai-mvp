package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import kotlinx.serialization.Serializable

/** Wire DTOs for `GET /api/deals`. Field names match the backend's `Deal` shape 1:1 (already
 *  camelCase server-side — this endpoint has no snake_case columns to map). */
@Serializable
data class DealsResponseDto(val deals: List<DealDto> = emptyList())

@Serializable
data class DealDto(
    val title: String = "",
    val category: String = "",
    val discount: String = "",
    val url: String = "",
    val source: String = "",
    val emoji: String = "",
    val badge: String? = null,
)

fun DealDto.toDomain(): Deal = Deal(
    title = title,
    category = category,
    discount = discount,
    url = url,
    source = source,
    emoji = emoji,
    badge = badge,
)
