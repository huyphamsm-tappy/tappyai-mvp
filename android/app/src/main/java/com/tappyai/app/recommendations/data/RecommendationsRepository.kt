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
                )
            },
            explanation = dto.explanation,
            personalized = dto.personalized,
        )
    }
}
