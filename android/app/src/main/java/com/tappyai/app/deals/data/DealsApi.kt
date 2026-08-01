package com.tappyai.app.deals.data

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Retrofit contract for `GET /api/deals` — built from the shared singleton [retrofit2.Retrofit]
 *  (core:network), same convention as every other feature's Api interface. */
interface DealsApi {
    /** [lang] is the app's active UI language (BCP-47, e.g. "en"/"vi"). The backend localizes
     *  category/description for it and falls back to Vietnamese field-by-field for anything not
     *  translated — so an older backend that ignores the param simply returns Vietnamese. */
    @GET("api/deals")
    suspend fun getDeals(@Query("lang") lang: String): DealsResponseDto

    /** Best-effort +1 popularity counter (RPC `increment_deal_click`); always 200, no body. Fired
     *  fire-and-forget on card open, never gating the link — matches the web's `fetch(...).catch()`. */
    @POST("api/deals/{id}/click")
    suspend fun postDealClick(@Path("id") id: String): Response<Unit>
}
