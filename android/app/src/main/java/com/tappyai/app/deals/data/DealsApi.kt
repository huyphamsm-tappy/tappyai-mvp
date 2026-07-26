package com.tappyai.app.deals.data

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Retrofit contract for `GET /api/deals` — built from the shared singleton [retrofit2.Retrofit]
 *  (core:network), same convention as every other feature's Api interface. */
interface DealsApi {
    @GET("api/deals")
    suspend fun getDeals(): DealsResponseDto

    /** Best-effort +1 popularity counter (RPC `increment_deal_click`); always 200, no body. Fired
     *  fire-and-forget on card open, never gating the link — matches the web's `fetch(...).catch()`. */
    @POST("api/deals/{id}/click")
    suspend fun postDealClick(@Path("id") id: String): Response<Unit>
}
