package com.tappyai.app.deals.data

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
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

    /**
     * Best-effort +1 on a deal's popularity counter (`increment_deal_click`, SECURITY DEFINER).
     *
     * The route swallows every failure and returns 200 with no body, so [Response]<[Unit]> is the
     * honest type — there is nothing to decode and nothing to check. Fired fire-and-forget when a
     * card is opened, mirroring the web's `fetch(..., { keepalive: true }).catch(() => {})`; it must
     * never gate the link.
     */
    @POST("api/deals/{id}/click")
    suspend fun postDealClick(@Path("id") id: String): Response<Unit>
}
