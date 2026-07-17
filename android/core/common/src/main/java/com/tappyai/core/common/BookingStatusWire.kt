package com.tappyai.core.common

/**
 * The backend's `bookings.status` values, canonicalized in exactly one place. Two features
 * (Bookings' own list, Service Detail's "my bookings here" section) independently parsed this
 * same wire string into two structurally-identical-but-separate enums — a real drift risk: a
 * future backend status addition (e.g. `"completed"`) landing in one feature's `when` and being
 * missed in the other. Both now delegate their string→status decision to [parseBookingStatusWire]
 * so that decision can only ever be made once; each feature still keeps its own enum type for its
 * own UI `when` exhaustiveness.
 */
enum class BookingWireStatus { Pending, Confirmed, Cancelled }

fun parseBookingStatusWire(raw: String?): BookingWireStatus = when (raw?.lowercase()?.trim()) {
    "confirmed" -> BookingWireStatus.Confirmed
    "cancelled", "canceled" -> BookingWireStatus.Cancelled
    else -> BookingWireStatus.Pending
}
