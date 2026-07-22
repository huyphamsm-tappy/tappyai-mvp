package com.tappyai.app.servicedetail

/** A community review shown in the "Đánh giá từ TappyAI" section. */
data class CommunityReview(
    val id: String,
    val rating: Int,
    val body: String,
    val createdAtMillis: Long,
    val photos: List<String>,
)

/** The user's own past booking for this service ("Lịch đặt của bạn"). */
data class MyBooking(
    val date: String,
    val time: String?,
    val guests: Int,
    val status: MyBookingStatus,
)

enum class MyBookingStatus { Pending, Confirmed, Cancelled }

/**
 * The community-reviews payload: the ranked list plus the aggregate the header shows. [avgRating]
 * is the backend's own `avg_rating` (null when there are no reviews) — not recomputed on device.
 */
data class ServiceReviews(
    val reviews: List<CommunityReview>,
    val avgRating: Double?,
)

/**
 * The immutable service facts shown on the detail screen — all sourced from the tapped favorite
 * (name/address/type/placeId) plus the derived [serviceId] slug. Mirrors the web page, which for a
 * favorite-originated visit renders purely from these query params (no `services` DB row exists for
 * a slug id, so that server-side branch never fires).
 */
data class ServiceInfo(
    val serviceId: String,
    val name: String,
    val address: String,
    val type: String,
    val placeId: String,
)
