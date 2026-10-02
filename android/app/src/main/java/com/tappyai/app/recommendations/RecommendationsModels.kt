package com.tappyai.app.recommendations

import java.time.Instant

/**
 * A single ranked place suggestion — the display slice of the web's `RankedRecommendation`, plus
 * the additive place facts (2026-09-28) the D:/redesign card shows: [address], [photoUrl] (latest
 * community photo), [averageRating], [reviewCount], [latestReviewAt]. Every fact is null/0 when the
 * server does not send it, and then its chip is simply not drawn (never a placeholder value).
 */
data class Recommendation(
    val placeId: String,
    val placeName: String,
    val matchedSignals: List<String>,
    val address: String? = null,
    val photoUrl: String? = null,
    val averageRating: Double? = null,
    val reviewCount: Int = 0,
    val latestReviewAt: String? = null,
) {
    /** The engine's English words ("Near …", "5.0★") duplicate the fact chips — web shows them only for a server without facts. */
    val showEngineSignals: Boolean get() = averageRating == null && address == null
}

/** A community review in the last 14 days — the web's `isRecentlyActive` (a real date, never a guess). */
fun isRecentlyActive(iso: String?, nowMs: Long = System.currentTimeMillis()): Boolean {
    val t = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return false
    return nowMs - t < 14L * 24 * 3600 * 1000
}

/**
 * The recommendations payload backing the screen. [personalized] drives the section title
 * (personalized vs. "popular nearby") exactly as the web does; [explanation] is the root-level
 * summary rendered as chips above the list.
 */
data class Recommendations(
    val items: List<Recommendation>,
    val explanation: List<String>,
    val personalized: Boolean,
)
