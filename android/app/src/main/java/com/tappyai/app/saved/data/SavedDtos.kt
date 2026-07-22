package com.tappyai.app.saved.data

import com.tappyai.app.saved.FavoritePlace
import com.tappyai.app.saved.SavedReview
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset

/**
 * Wire DTOs for the Saved library's two sources: `GET /api/favorites` (saved places) and
 * `GET /api/reviews/saved` (bookmarked reviews). Both return snake_case rows with ISO-string
 * timestamps mapped to the domain models' epoch-millis Longs. Domain models ([FavoritePlace],
 * [SavedReview]) are unchanged — mapping (incl. ISO→millis) lives here.
 *
 * This module defines its own favorites DTO rather than sharing the (frozen) Maps module's — each
 * module owns its wire contract; consolidation is deferred to the final Production Audit Sprint.
 */

// ---- /api/favorites -------------------------------------------------------------

@Serializable
data class FavoritesResponseDto(
    val favorites: List<FavoriteDto> = emptyList(),
)

@Serializable
data class FavoriteDto(
    val id: String = "",
    @SerialName("place_id") val placeId: String = "",
    @SerialName("place_name") val placeName: String = "",
    @SerialName("place_address") val placeAddress: String = "",
    @SerialName("place_type") val placeType: String = "",
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class OkResponseDto(val ok: Boolean = false)

// ---- /api/reviews/saved ---------------------------------------------------------

@Serializable
data class SavedReviewsResponseDto(
    val reviews: List<SavedReviewDto> = emptyList(),
)

@Serializable
data class SavedReviewDto(
    val id: String = "",
    @SerialName("place_name") val placeName: String? = null,
    val body: String? = null,
    val thumbnail: String? = null,
    @SerialName("content_type") val contentType: String? = null,
    @SerialName("saved_at") val savedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

// ---- mappers --------------------------------------------------------------------

fun FavoriteDto.toDomain(): FavoritePlace = FavoritePlace(
    id = id,
    placeId = placeId,
    name = placeName,
    address = placeAddress,
    type = placeType,
    savedAtMillis = parseTimestampMillis(createdAt) ?: 0L,
)

fun SavedReviewDto.toDomain(): SavedReview = SavedReview(
    id = id,
    placeName = placeName,
    body = body,
    thumbnailUrl = thumbnail,
    // Backend orders by saved_at (falling back to the review's created_at) — mirror that.
    savedAtMillis = parseTimestampMillis(savedAt ?: createdAt) ?: 0L,
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
