package com.tappyai.app.maps.data

import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Retrofit contract for Maps place data. Built from the shared [retrofit2.Retrofit] (core:network)
 * so it reuses the singleton OkHttp client — the [com.tappyai.core.network.AuthInterceptor]
 * attaches `Authorization: Bearer …` automatically, which both endpoints require (401 otherwise).
 * suspend → coroutine cancellation is automatic.
 *
 * The favorites read returns the full saved-places list with no pagination params (no
 * page/limit/cursor), so there is nothing to paginate. [deleteFavorite] backs the detail sheet's
 * "Remove" action — every place shown on this screen is, by construction, already a favorite (see
 * `MapPlace`'s doc), so removing is the only coherent save-state mutation available here; matches
 * `SavedApi.deleteFavorite`'s contract exactly (same endpoint, same query param).
 */
interface MapsApi {

    @GET("api/favorites")
    suspend fun getFavorites(): FavoritesResponseDto

    @DELETE("api/favorites")
    suspend fun deleteFavorite(@Query("placeId") placeId: String): OkResponseDto
}
