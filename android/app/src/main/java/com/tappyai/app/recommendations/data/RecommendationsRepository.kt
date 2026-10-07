package com.tappyai.app.recommendations.data

import com.tappyai.app.recommendations.Recommendation
import com.tappyai.app.recommendations.Recommendations
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Abstraction over `GET api/recommendations`. The screen depends on this + domain types only. */
interface RecommendationsRepository {

    suspend fun getRecommendations(): NetworkResult<Recommendations>
}

@Singleton
class RealRecommendationsRepository @Inject constructor(
    private val api: RecommendationsApi,
) : RecommendationsRepository {

    override suspend fun getRecommendations(): NetworkResult<Recommendations> = safeApiCall {
        val dto = api.getRecommendations()
        Recommendations(
            items = dto.recommendations.map { r ->
                Recommendation(
                    placeId = r.placeId,
                    placeName = r.placeName,
                    matchedSignals = r.matchedSignals,
                    address = r.address?.takeIf { it.isNotBlank() },
                    photoUrl = r.photoUrl?.takeIf { it.isNotBlank() },
                    averageRating = r.averageRating?.takeIf { it > 0 },
                    reviewCount = r.reviewCount,
                    latestReviewAt = r.latestReviewAt,
                )
            },
            explanation = dto.explanation,
            personalized = dto.personalized,
        )
    }
}
