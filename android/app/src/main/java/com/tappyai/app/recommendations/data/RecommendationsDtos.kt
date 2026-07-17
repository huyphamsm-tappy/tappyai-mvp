package com.tappyai.app.recommendations.data

import kotlinx.serialization.Serializable

/**
 * `GET api/recommendations` response. Mirrors the web route's `NextResponse.json({ ... })` shape.
 * The server already returns [recommendations] ranked (highest [RankedRecommendationDto.finalScore]
 * first), so clients render them in order without re-sorting — matching the web page, which maps
 * the array as-is. The shared lenient Json drops the response's `confidence`/`candidateCount` and
 * each recommendation's `rejectedSignals`/`scoreBreakdown` — fields the UI doesn't render.
 */
@Serializable
data class RecommendationsResponseDto(
    val recommendations: List<RankedRecommendationDto> = emptyList(),
    val explanation: List<String> = emptyList(),
    val personalized: Boolean = false,
)

@Serializable
data class RankedRecommendationDto(
    val placeId: String = "",
    val placeName: String = "",
    val matchedSignals: List<String> = emptyList(),
)
