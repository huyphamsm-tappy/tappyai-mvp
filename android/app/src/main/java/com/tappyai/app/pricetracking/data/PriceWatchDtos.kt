package com.tappyai.app.pricetracking.data

import com.tappyai.app.pricetracking.PriceWatch
import com.tappyai.app.pricetracking.PriceWatchStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset

/**
 * Wire DTOs for `/api/price-watch`. GET returns snake_case rows; timestamps are ISO strings that
 * map to the domain model's epoch-millis Longs. The domain model ([PriceWatch]) is unchanged —
 * mapping (incl. String→enum and ISO→millis) lives here per the standing convention.
 */
@Serializable
data class PriceWatchesResponseDto(
    val watches: List<PriceWatchDto> = emptyList(),
)

@Serializable
data class PriceWatchDto(
    val id: String = "",
    @SerialName("product_name") val productName: String = "",
    @SerialName("target_price") val targetPrice: Long = 0,
    @SerialName("current_price") val currentPrice: Long? = null,
    val status: String = "active",
    @SerialName("last_checked") val lastChecked: String? = null,
    @SerialName("notified_at") val notifiedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

/** DELETE body — the backend cancels the watch by id (soft-cancel to `status: 'cancelled'`). */
@Serializable
data class DeleteWatchRequestDto(val id: String)

@Serializable
data class OkResponseDto(val ok: Boolean = false)

fun PriceWatchDto.toDomain(): PriceWatch = PriceWatch(
    id = id,
    productName = productName,
    targetPrice = targetPrice,
    currentPrice = currentPrice,
    // GET excludes 'cancelled'; anything not 'triggered' shows in the active section.
    status = if (status.equals("triggered", ignoreCase = true)) {
        PriceWatchStatus.TRIGGERED
    } else {
        PriceWatchStatus.ACTIVE
    },
    lastChecked = parseTimestampMillis(lastChecked),
    notifiedAt = parseTimestampMillis(notifiedAt),
    createdAt = parseTimestampMillis(createdAt) ?: 0L,
)

/** Parses a Postgres/ISO-8601 timestamp to epoch millis; null/unparseable → null. */
private fun parseTimestampMillis(iso: String?): Long? {
    if (iso.isNullOrBlank()) return null
    val normalized = iso.trim().replace(' ', 'T')
    return try {
        OffsetDateTime.parse(normalized).toInstant().toEpochMilli()
    } catch (_: Exception) {
        try {
            LocalDateTime.parse(normalized).toInstant(ZoneOffset.UTC).toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }
}
