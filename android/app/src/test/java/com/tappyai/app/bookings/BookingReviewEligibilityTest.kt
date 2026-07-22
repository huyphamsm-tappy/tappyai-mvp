package com.tappyai.app.bookings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the Review-button gate against the web's, which is one expression in
 * `src/app/profile/bookings/page.tsx`:
 *
 * ```tsx
 * {b.place_id && b.date < todayVN && !reviewedPlaceIds.has(b.place_id) && ( … )}
 * ```
 *
 * Worth testing because every term fails silently in a different, user-visible way: a wrong
 * timezone shows the button a day early, a missed `place_id` offers a review that can't be
 * attributed, and a broken reviewed-set check invites a duplicate review the web would have hidden.
 */
class BookingReviewEligibilityTest {

    private val reviewed = setOf("place-already-reviewed")
    private val today = "2026-07-16"

    @Test
    fun `past booking at an unreviewed place is reviewable`() {
        assertTrue(isBookingReviewable("place-a", "2026-07-15", today, reviewed))
    }

    /** The web uses a strict `<`, so the day of the booking is not yet reviewable. */
    @Test
    fun `booking dated today is not reviewable`() {
        assertFalse(isBookingReviewable("place-a", today, today, reviewed))
    }

    @Test
    fun `future booking is not reviewable`() {
        assertFalse(isBookingReviewable("place-a", "2026-07-17", today, reviewed))
    }

    @Test
    fun `already-reviewed place is not reviewable again`() {
        assertFalse(isBookingReviewable("place-already-reviewed", "2026-07-15", today, reviewed))
    }

    @Test
    fun `booking without a place id is not reviewable`() {
        assertFalse(isBookingReviewable(null, "2026-07-15", today, reviewed))
        assertFalse(isBookingReviewable("", "2026-07-15", today, reviewed))
        assertFalse(isBookingReviewable("   ", "2026-07-15", today, reviewed))
    }

    @Test
    fun `booking with an unparseable or missing date is not reviewable`() {
        assertFalse(isBookingReviewable("place-a", "", today, reviewed))
    }

    /** Lexicographic compare must hold across month and year boundaries for ISO dates. */
    @Test
    fun `date comparison holds across month and year rollover`() {
        assertTrue(isBookingReviewable("place-a", "2025-12-31", "2026-01-01", reviewed))
        assertFalse(isBookingReviewable("place-a", "2026-01-02", "2026-01-01", reviewed))
        assertTrue(isBookingReviewable("place-a", "2026-06-30", "2026-07-01", reviewed))
    }

    /**
     * `vietnamToday` must track UTC+7, not the JVM's zone. 2026-07-15T18:00Z is already the 16th in
     * Vietnam (+7 → 01:00), which is exactly the window where a device-local implementation would
     * silently disagree with the web.
     */
    @Test
    fun `vietnamToday rolls over at UTC+7 not UTC`() {
        // 2026-07-15T18:00:00Z → 2026-07-16T01:00 in Vietnam.
        assertEquals("2026-07-16", vietnamToday(1_784_138_400_000L))
        // 2026-07-15T16:00:00Z → 2026-07-15T23:00 in Vietnam, still the 15th.
        assertEquals("2026-07-15", vietnamToday(1_784_131_200_000L))
    }
}
