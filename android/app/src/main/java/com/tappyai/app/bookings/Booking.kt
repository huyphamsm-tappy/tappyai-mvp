package com.tappyai.app.bookings

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class BookingStatus { Pending, Confirmed, Cancelled }

/**
 * A booking — mirrors the web `bookings` row (`/api/bookings`).
 *
 * [canReview] mirrors the web's computed eligibility (has place_id + date is past + place not yet
 * reviewed). It is not a backend field: the web computes it in its own page, so
 * [com.tappyai.app.bookings.BookingsViewModel] computes it the same way rather than the DTO mapper,
 * which can't see the user's existing reviews. [rawDate] is kept alongside [dateMillis] because
 * that comparison is a `YYYY-MM-DD` string compare against a UTC+7 today — see
 * [com.tappyai.app.bookings.isBookingReviewable].
 */
data class Booking(
    val id: String,
    val placeId: String?,
    val serviceName: String,
    val serviceType: String,
    val customerName: String,
    val customerPhone: String,
    val rawDate: String,
    val dateMillis: Long,
    val time: String?,
    val guests: Int,
    val notes: String?,
    val status: BookingStatus,
    val canReview: Boolean,
)

/**
 * "Today" in Vietnam time as `YYYY-MM-DD`, mirroring the web's
 * `new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)`.
 *
 * The web deliberately fixes this to UTC+7 rather than the viewer's own timezone, so a booking
 * becomes reviewable at the same moment for every user. Android therefore must not use the device
 * timezone here — doing so would let the Review button appear a day early or late depending on
 * where the phone is, diverging from the web for the same booking.
 */
fun vietnamToday(nowMillis: Long): String =
    Instant.ofEpochMilli(nowMillis).atZone(VIETNAM_ZONE).toLocalDate().toString()

private val VIETNAM_ZONE: ZoneId = ZoneId.of("Asia/Ho_Chi_Minh")

/**
 * The web's review gate, verbatim (`src/app/profile/bookings/page.tsx`):
 * `b.place_id && b.date < todayVN && !reviewedPlaceIds.has(b.place_id)`.
 *
 * The date test is a lexicographic compare of two `YYYY-MM-DD` strings, which is exactly what the
 * web does and is well-defined for that format. It is strictly `<`, so a booking dated *today* is
 * not yet reviewable — only a past one is.
 */
fun isBookingReviewable(
    placeId: String?,
    rawDate: String,
    todayVN: String,
    reviewedPlaceIds: Set<String>,
): Boolean {
    if (placeId.isNullOrBlank()) return false
    if (rawDate.isBlank() || rawDate >= todayVN) return false
    return placeId !in reviewedPlaceIds
}

/** Service type → emoji, mirroring the web `SERVICE_EMOJI` map (fallback 📍). */
fun emojiForServiceType(type: String): String = when (type) {
    "food" -> "🍜"
    "spa" -> "💆"
    "hotel" -> "🏨"
    "travel" -> "✈️"
    "shopping" -> "🛍️"
    "entertainment" -> "🎉"
    else -> "📍"
}

private val bookingDateFormatter = DateTimeFormatter.ofPattern("d MMM uuuu", Locale.ENGLISH)

/** `10 Jul 2026` (web shows `dd/MM/yyyy`; English UI uses this readable form). */
fun formatBookingDate(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate().format(bookingDateFormatter)

/** `1 guest` / `2 guests` (the row only shows when guests > 1, matching the web). */
fun guestsLabel(guests: Int): String = "$guests ${if (guests == 1) "guest" else "guests"}"
