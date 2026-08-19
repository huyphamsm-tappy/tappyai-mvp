package com.tappyai.app.deals.data

import retrofit2.http.GET
import retrofit2.http.Query

/** Retrofit contract for `GET /api/deals` — built from the shared singleton [retrofit2.Retrofit]
 *  (core:network), same convention as every other feature's Api interface. */
interface DealsApi {
    /**
     * [lang] is REQUIRED, not optional.
     *
     * The backend localizes `category` (and title/description) from this parameter and defaults to
     * Vietnamese when it is absent — its own comment says "clients pass their in-app language".
     * Android passed nothing, so an English user saw English chrome around Vietnamese data:
     * "Mua sắm · via Shopee", "Vận chuyển · via Grab". Making the parameter non-nullable means the
     * next caller cannot forget it the way this one did.
     */
    @GET("api/deals")
    suspend fun getDeals(@Query("lang") lang: String): DealsResponseDto
}
