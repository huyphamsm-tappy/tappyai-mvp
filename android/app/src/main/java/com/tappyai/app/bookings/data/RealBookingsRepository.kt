package com.tappyai.app.bookings.data

import com.tappyai.app.bookings.Booking
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [BookingsRepository]. The call goes through core:network's [safeApiCall], which
 * maps HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working. DTO→domain mapping happens here.
 */
@Singleton
class RealBookingsRepository @Inject constructor(
    private val api: BookingsApi,
) : BookingsRepository {

    override suspend fun getBookings(): NetworkResult<List<Booking>> =
        safeApiCall { api.getBookings().bookings.map { it.toDomain() } }
}
