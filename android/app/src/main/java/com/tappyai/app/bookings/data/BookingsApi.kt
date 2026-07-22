package com.tappyai.app.bookings.data

import retrofit2.http.GET

/**
 * Retrofit contract for Bookings. Built from the shared [retrofit2.Retrofit] (core:network) so the
 * [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …` — the endpoint
 * requires it (401 otherwise). suspend → coroutine cancellation.
 *
 * Only the list read is exposed. Bookings are created via chat (POST) and their status is set by
 * the venue — the screen has no create/cancel affordance — so no other endpoints are wired.
 */
interface BookingsApi {

    @GET("api/bookings")
    suspend fun getBookings(): BookingsResponseDto
}
