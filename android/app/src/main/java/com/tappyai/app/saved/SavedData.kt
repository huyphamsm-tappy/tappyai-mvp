package com.tappyai.app.saved

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** A favorited place — mirrors the web `/api/favorites` row (`favorites` table). */
data class FavoritePlace(
    val id: String,
    val placeId: String,
    val name: String,
    val address: String,
    val type: String,
    val savedAtMillis: Long,
)

/** A saved review/post — mirrors the web `/api/reviews/saved` row. */
data class SavedReview(
    val id: String,
    val placeName: String?,
    val body: String?,
    val thumbnailUrl: String?,
    val savedAtMillis: Long,
    /** `content_type == 'video'` — a video is a saved review, so "Video" is a filter over these. */
    val isVideo: Boolean = false,
)

/** Both kinds shown under one "Saved" home (web `/profile/favorites`). */
data class SavedData(
    val favorites: List<FavoritePlace>,
    val reviews: List<SavedReview>,
) {
    val total: Int get() = favorites.size + reviews.size
    val isEmpty: Boolean get() = favorites.isEmpty() && reviews.isEmpty()
}

/**
 * The hero's filter chips — web `SavedView.tsx` CHIPS, in its order. Deals and Bộ sưu tập (in the
 * reference) are HIDDEN, not "Sắp có", until something can be saved there (owner 2026-09-28).
 */
enum class SavedFilter { ALL, PLACES, POSTS, VIDEOS }

/** Web `readView(?type=)`: anything unknown is the hub. */
fun savedFilterOf(key: String?): SavedFilter = SavedFilter.entries.firstOrNull { it.name == key } ?: SavedFilter.ALL

/** Place type → emoji, mirroring the web `TYPE_EMOJI` map (fallback 📍). */
fun emojiForPlaceType(type: String): String = when (type) {
    "food" -> "🍜"
    "cafe" -> "☕"
    "hotel" -> "🏨"
    "travel" -> "✈️"
    "shopping" -> "🛍️"
    "entertainment" -> "🎉"
    "spa" -> "💆"
    else -> "📍"
}

private val savedDateFormatter = DateTimeFormatter.ofPattern("d MMM uuuu", Locale.ENGLISH)

/** `10 Jul 2026` — the web shows a `dd/MM/yyyy` date; English UI uses this readable form. */
fun formatSavedDate(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate().format(savedDateFormatter)
