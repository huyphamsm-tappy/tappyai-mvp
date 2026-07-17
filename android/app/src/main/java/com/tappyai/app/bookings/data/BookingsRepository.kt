package com.tappyai.app.bookings.data

import com.tappyai.app.bookings.Booking
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the bookings backend. The ViewModel depends on this and domain [Booking] only —
 * never on Retrofit/OkHttp or the DTOs.
 */
interface BookingsRepository {

    /** The current user's bookings (newest first, capped at 20 by the backend), or a typed error. */
    suspend fun getBookings(): NetworkResult<List<Booking>>
}
