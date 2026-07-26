package com.tappyai.app.deals

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/**
 * Pins the deal countdown against the web `promoCountdown` (`src/lib/deals/countdown.ts`):
 * expired/absent → None, ≤24h → Soon, else Days(max(1, round(hoursLeft/24))). Pure, permanent
 * regression test.
 */
class PromoCountdownTest {

    private val now = 1_700_000_000_000L // fixed reference "now"
    private fun isoIn(hours: Double): String = Instant.ofEpochMilli(now + (hours * 3_600_000).toLong()).toString()

    @Test
    fun `null blank or invalid is None`() {
        assertEquals(PromoCountdown.None, promoCountdown(null, now))
        assertEquals(PromoCountdown.None, promoCountdown("", now))
        assertEquals(PromoCountdown.None, promoCountdown("not-a-date", now))
    }

    @Test
    fun `expired is None`() {
        assertEquals(PromoCountdown.None, promoCountdown(isoIn(-1.0), now))
        assertEquals(PromoCountdown.None, promoCountdown(isoIn(0.0), now)) // exactly now → hoursLeft 0 → None
    }

    @Test
    fun `within 24h is Soon`() {
        assertEquals(PromoCountdown.Soon, promoCountdown(isoIn(1.0), now))
        assertEquals(PromoCountdown.Soon, promoCountdown(isoIn(24.0), now)) // boundary: <=24 → Soon
    }

    @Test
    fun `beyond 24h is Days rounded`() {
        assertEquals(PromoCountdown.Days(1), promoCountdown(isoIn(25.0), now)) // 25/24 → round 1
        assertEquals(PromoCountdown.Days(2), promoCountdown(isoIn(48.0), now))
        assertEquals(PromoCountdown.Days(3), promoCountdown(isoIn(60.0), now)) // 60/24=2.5 → round 3 (HALF_UP)
    }
}
