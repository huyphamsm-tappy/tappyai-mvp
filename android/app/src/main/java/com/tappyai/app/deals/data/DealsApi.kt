package com.tappyai.app.deals.data

import retrofit2.http.GET

/** Retrofit contract for `GET /api/deals` — built from the shared singleton [retrofit2.Retrofit]
 *  (core:network), same convention as every other feature's Api interface. */
interface DealsApi {
    @GET("api/deals")
    suspend fun getDeals(): DealsResponseDto
}
