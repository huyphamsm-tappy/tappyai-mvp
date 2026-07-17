package com.tappyai.app.servicedetail.data

import com.tappyai.app.servicedetail.CommunityReview
import com.tappyai.app.servicedetail.MyBooking
import com.tappyai.app.servicedetail.MyBookingStatus
import com.tappyai.app.servicedetail.ServiceReviews
import com.tappyai.core.common.BookingWireStatus
import com.tappyai.core.common.parseBookingStatusWire
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

/** Abstraction over the service-detail reads/writes. Screen depends on this + domain types only. */
interface ServiceDetailRepository {

    /** Community reviews for [placeId]; blank placeId → an empty result (the web renders none). */
    suspend fun getReviews(placeId: String): NetworkResult<ServiceReviews>

    /** The user's past bookings for [serviceId], filtered client-side from the full list. */
    suspend fun getMyBookings(serviceId: String): NetworkResult<List<MyBooking>>

    /** Submits a booking; returns success/failure so the form can show the confirmation state. */
    suspend fun createBooking(request: CreateBookingRequestDto): NetworkResult<Unit>
}

@Singleton
class RealServiceDetailRepository @Inject constructor(
    private val api: ServiceDetailApi,
) : ServiceDetailRepository {

    override suspend fun getReviews(placeId: String): NetworkResult<ServiceReviews> {
        if (placeId.isBlank()) return NetworkResult.Success(ServiceReviews(emptyList(), null))
        return safeApiCall {
            val dto = api.getReviews(placeId)
            ServiceReviews(
                reviews = dto.reviews.map { r ->
                    CommunityReview(
                        id = r.id,
                        rating = r.rating,
                        body = r.body.orEmpty(),
                        createdAtMillis = parseTimestamp(r.createdAt),
                        photos = r.photos ?: emptyList(),
                    )
                },
                avgRating = dto.avgRating,
            )
        }
    }

    override suspend fun getMyBookings(serviceId: String): NetworkResult<List<MyBooking>> = safeApiCall {
        api.getBookings().bookings
            .filter { it.serviceId == serviceId }
            .map { b ->
                MyBooking(
                    date = b.date.orEmpty(),
                    time = b.time?.takeIf { it.isNotBlank() },
                    guests = b.guests ?: 1,
                    status = b.status.toStatus(),
                )
            }
            // The web reads the newest 3 (`order created_at desc limit 3`); the list arrives newest
            // first from the same ordering, so take the first three after filtering.
            .take(3)
    }

    override suspend fun createBooking(request: CreateBookingRequestDto): NetworkResult<Unit> =
        safeApiCall { api.createBooking(request); Unit }

    private fun String?.toStatus(): MyBookingStatus = when (parseBookingStatusWire(this)) {
        BookingWireStatus.Confirmed -> MyBookingStatus.Confirmed
        BookingWireStatus.Cancelled -> MyBookingStatus.Cancelled
        BookingWireStatus.Pending -> MyBookingStatus.Pending
    }

    /** Reviews' `created_at` is a full ISO timestamp; date-only is tolerated too. Unparseable → 0. */
    private fun parseTimestamp(raw: String?): Long {
        if (raw.isNullOrBlank()) return 0L
        val s = raw.trim()
        return try {
            OffsetDateTime.parse(s.replace(' ', 'T')).toInstant().toEpochMilli()
        } catch (_: Exception) {
            try {
                LocalDate.parse(s).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
            } catch (_: Exception) {
                0L
            }
        }
    }
}
