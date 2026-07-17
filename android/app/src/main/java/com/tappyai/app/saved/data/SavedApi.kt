package com.tappyai.app.saved.data

import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Retrofit contract for the Saved library. Built from the shared [retrofit2.Retrofit] (core:network)
 * so the [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …` — all three
 * endpoints require it (401 otherwise). suspend → coroutine cancellation.
 *
 * Favorites delete uses a `placeId` query param (no body), matching the backend's
 * `DELETE /api/favorites?placeId=…`. Saved reviews have no delete (the screen exposes none).
 */
interface SavedApi {

    @GET("api/favorites")
    suspend fun getFavorites(): FavoritesResponseDto

    @GET("api/reviews/saved")
    suspend fun getSavedReviews(): SavedReviewsResponseDto

    @DELETE("api/favorites")
    suspend fun deleteFavorite(@Query("placeId") placeId: String): OkResponseDto
}
