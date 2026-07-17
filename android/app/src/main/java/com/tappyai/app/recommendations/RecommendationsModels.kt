package com.tappyai.app.recommendations

/**
 * A single ranked place suggestion — the display slice of the web's `RankedRecommendation`. Only
 * the fields the screen renders: the place, and the human-readable [matchedSignals] chips (e.g.
 * "Korean BBQ", "Near Quận 3", "4.5★"). The server returns these already ranked.
 */
data class Recommendation(
    val placeId: String,
    val placeName: String,
    val matchedSignals: List<String>,
)

/**
 * The recommendations payload backing the screen. [personalized] drives the subtitle copy
 * (personalized vs. "popular nearby") exactly as the web does; [explanation] is the root-level
 * summary rendered as chips above the list.
 */
data class Recommendations(
    val items: List<Recommendation>,
    val explanation: List<String>,
    val personalized: Boolean,
)
