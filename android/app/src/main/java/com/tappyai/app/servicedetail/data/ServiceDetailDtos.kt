package com.tappyai.app.servicedetail.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * `GET api/reviews?placeId=` response — the community ("Đánh giá từ TappyAI") reviews for a place.
 * Mirrors the web route's `NextResponse.json({ reviews, avg_rating, count })`. The shared lenient
 * Json drops fields the detail screen doesn't render (user_id, like_count, is_verified, profiles…).
 */
@Serializable
data class ServiceReviewsResponseDto(
    val reviews: List<ServiceReviewDto> = emptyList(),
    @SerialName("avg_rating") val avgRating: Double? = null,
    val count: Int = 0,
)

@Serializable
data class ServiceReviewDto(
    val id: String = "",
    val rating: Int = 0,
    val body: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val photos: List<String>? = null,
)

/**
 * `POST api/bookings` body. Identical field-for-field to the web `BookingForm`'s
 * `JSON.stringify({ serviceId, serviceName, serviceType, date, time, guests, name, phone, notes,
 * placeId })`. [placeId] is nullable exactly as the web sends `placeId || null`.
 */
@Serializable
data class CreateBookingRequestDto(
    val serviceId: String,
    val serviceName: String,
    val serviceType: String,
    val date: String,
    val time: String,
    val guests: Int,
    val name: String,
    val phone: String,
    val notes: String,
    val placeId: String?,
)

/** `POST api/bookings` success body: `{ ok: true, bookingId }`. */
@Serializable
data class CreateBookingResponseDto(
    val ok: Boolean = false,
    val bookingId: String? = null,
)

/**
 * One row from `GET api/bookings` (`select('*')`), read here only for the "Lịch đặt của bạn"
 * section. Just the fields that section shows plus [serviceId] for client-side filtering (the web
 * queries `bookings.eq('service_id', params.id)` directly; Android has no per-service REST read, so
 * it filters the full list — same result, computed client-side, not new business logic).
 */
@Serializable
data class ServiceBookingDto(
    @SerialName("service_id") val serviceId: String? = null,
    val date: String? = null,
    val time: String? = null,
    val guests: Int? = null,
    val status: String? = null,
)

@Serializable
data class ServiceBookingsResponseDto(
    val bookings: List<ServiceBookingDto> = emptyList(),
)
