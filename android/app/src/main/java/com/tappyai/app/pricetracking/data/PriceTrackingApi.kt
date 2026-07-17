package com.tappyai.app.pricetracking.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP

/**
 * Retrofit contract for `/api/price-watch`. Built from the shared [retrofit2.Retrofit]
 * (core:network) so the [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …`
 * — both endpoints require it (401 otherwise). suspend → coroutine cancellation.
 *
 * GET returns the full non-cancelled list (limit 20, no pagination params). DELETE sends the id in
 * a JSON body, so it uses @HTTP(hasBody = true) — Retrofit's plain @DELETE forbids @Body. POST
 * (create) is intentionally absent: watches are created via chat, per the screen's own info card.
 */
interface PriceTrackingApi {

    @GET("api/price-watch")
    suspend fun getWatches(): PriceWatchesResponseDto

    @HTTP(method = "DELETE", path = "api/price-watch", hasBody = true)
    suspend fun deleteWatch(@Body body: DeleteWatchRequestDto): OkResponseDto
}
