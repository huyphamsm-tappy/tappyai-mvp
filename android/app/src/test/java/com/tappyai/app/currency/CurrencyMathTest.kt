package com.tappyai.app.currency

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the USD-based cross-rate math against the web `crossRate` (`src/lib/finance/exchange.ts`),
 * the Bug #15 hardening: a missing/invalid currency must NEVER silently convert at ×1 — it returns
 * null (→ the screen shows an explicit "missing rate" error) instead of a wrong number.
 */
class CurrencyMathTest {

    // USD-based table (units per 1 USD), USD == 1, mirroring GET /api/rates.
    private val rates = mapOf("USD" to 1.0, "VND" to 25_400.0, "EUR" to 0.92, "JPY" to 157.0)

    @Test
    fun `cross rate is to over from, USD needs no special case`() {
        // 1 USD = 25,400 VND.
        assertEquals(25_400.0, crossRate(rates, "USD", "VND")!!, 0.0001)
        // 1 VND = 1/25,400 USD.
        assertEquals(1.0 / 25_400.0, crossRate(rates, "VND", "USD")!!, 1e-12)
        // Non-USD pair via USD: EUR→JPY = 157 / 0.92.
        assertEquals(157.0 / 0.92, crossRate(rates, "EUR", "JPY")!!, 0.0001)
    }

    @Test
    fun `missing or invalid rate returns null, never a silent x1 fallback`() {
        assertNull(crossRate(rates, "USD", "GBP")) // GBP absent
        assertNull(crossRate(rates, "GBP", "USD")) // GBP absent (from side)
        assertNull(crossRate(mapOf("USD" to 1.0, "VND" to 0.0), "USD", "VND")) // non-positive
        assertNull(crossRate(mapOf("USD" to 1.0, "VND" to Double.NaN), "USD", "VND")) // non-finite
    }

    @Test
    fun `firstMissingRateCode reports the from side before the to side`() {
        assertNull(firstMissingRateCode(rates, "USD", "VND"))
        assertEquals("GBP", firstMissingRateCode(rates, "GBP", "VND")) // from missing
        assertEquals("GBP", firstMissingRateCode(rates, "VND", "GBP")) // to missing
        // Both missing → from is reported first (matches web crossRate throw order).
        assertEquals("AUD", firstMissingRateCode(rates, "AUD", "GBP"))
    }

    @Test
    fun `isValidRate matches the web definition`() {
        assertTrue(isValidRate(1.0))
        assertFalse(isValidRate(null))
        assertFalse(isValidRate(0.0))
        assertFalse(isValidRate(-1.0))
        assertFalse(isValidRate(Double.POSITIVE_INFINITY))
        assertFalse(isValidRate(Double.NaN))
    }
}
