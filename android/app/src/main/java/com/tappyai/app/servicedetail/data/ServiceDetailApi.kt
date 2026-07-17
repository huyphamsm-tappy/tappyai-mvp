package com.tappyai.app.servicedetail.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Retrofit contract for the service-detail screen. Reuses two existing backend routes — the
 * community reviews read and the booking read/create — no new endpoints (see the web
 * `/service/[id]` server component + `BookingForm`).
 */
interface ServiceDetailApi {

    /** Community reviews for a place ("Đánh giá từ TappyAI"). */
    @GET("api/reviews")
    suspend fun getReviews(@Query("placeId") placeId: String): ServiceReviewsResponseDto

    /** All of the user's bookings — filtered to this service client-side (see [ServiceBookingDto]). */
    @GET("api/bookings")
    suspend fun getBookings(): ServiceBookingsResponseDto

    /** Creates a booking (the web `BookingForm`'s POST). */
    @POST("api/bookings")
    suspend fun createBooking(@Body body: CreateBookingRequestDto): CreateBookingResponseDto
}
