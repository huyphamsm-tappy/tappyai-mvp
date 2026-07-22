package com.tappyai.app.recommendations.data

import retrofit2.http.GET

/** Retrofit contract for personalized recommendations. Auth-only, no params — the backend derives
 *  everything from the bearer user (see `src/app/api/recommendations/route.ts`). */
interface RecommendationsApi {

    @GET("api/recommendations")
    suspend fun getRecommendations(): RecommendationsResponseDto
}
