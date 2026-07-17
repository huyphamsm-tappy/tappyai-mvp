package com.tappyai.app.bookings.data

import com.tappyai.app.bookings.Booking
import com.tappyai.app.bookings.BookingStatus
import com.tappyai.core.common.BookingWireStatus
import com.tappyai.core.common.parseBookingStatusWire
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Wire DTOs for `GET /api/bookings`. The endpoint returns raw `bookings` rows (`select('*')`) in
 * snake_case; unused columns (user_id, service_id, place_id, created_at, …) are dropped by the
 * shared lenient Json. Mapping to the unchanged [Booking] domain model (incl. String→enum and the
 * date string→millis) lives here.
 */
@Serializable
data class BookingsResponseDto(
    val bookings: List<BookingDto> = emptyList(),
)

@Serializable
data class BookingDto(
    val id: String = "",
    @SerialName("place_id") val placeId: String? = null,
    @SerialName("service_name") val serviceName: String? = null,
    @SerialName("service_type") val serviceType: String? = null,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("customer_phone") val customerPhone: String? = null,
    val date: String? = null,
    val time: String? = null,
    val guests: Int? = null,
    val notes: String? = null,
    val status: String? = null,
)

/**
 * [Booking.canReview] is left false here and filled in by
 * [com.tappyai.app.bookings.BookingsViewModel], which is the only layer that can see both the
 * booking and the user's existing reviews. The rule is not backend business logic — the web
 * computes it in its own page from the same two reads — so mirroring it there is parity, not
 * duplication. (An earlier comment here claimed the affordance had to stay hidden "until the
 * backend exposes it"; that was wrong: `select('*')` already ships `place_id`.)
 */
fun BookingDto.toDomain(): Booking = Booking(
    id = id,
    placeId = placeId?.takeIf { it.isNotBlank() },
    serviceName = serviceName ?: "",
    serviceType = serviceType ?: "",
    customerName = customerName ?: "",
    customerPhone = customerPhone ?: "",
    rawDate = date?.trim().orEmpty(),
    dateMillis = parseDateMillis(date),
    time = time?.takeIf { it.isNotBlank() },
    guests = guests ?: 1,
    notes = notes?.takeIf { it.isNotBlank() },
    status = status.toBookingStatus(),
    canReview = false,
)

private fun String?.toBookingStatus(): BookingStatus = when (parseBookingStatusWire(this)) {
    BookingWireStatus.Confirmed -> BookingStatus.Confirmed
    BookingWireStatus.Cancelled -> BookingStatus.Cancelled
    BookingWireStatus.Pending -> BookingStatus.Pending
}

/**
 * Parses the booking `date` to epoch millis. The column is typically a date-only string
 * (`2026-07-18`), but a full ISO timestamp is handled too; unparseable/blank → 0L.
 */
private fun parseDateMillis(raw: String?): Long {
    if (raw.isNullOrBlank()) return 0L
    val s = raw.trim()
    return try {
        LocalDate.parse(s).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    } catch (_: Exception) {
        val normalized = s.replace(' ', 'T')
        try {
            OffsetDateTime.parse(normalized).toInstant().toEpochMilli()
        } catch (_: Exception) {
            try {
                LocalDateTime.parse(normalized).toInstant(ZoneOffset.UTC).toEpochMilli()
            } catch (_: Exception) {
                0L
            }
        }
    }
}
