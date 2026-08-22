package com.tappyai.app.currency

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * B15 — an exchange rate must actually say something.
 *
 * The two rate lines used a fixed decimal count taken from the currency, so the inverse of a
 * VND rate rendered as
 *
 *     1 VND = 0,0000 USD
 *
 * — true, and completely uninformative, on the app's primary currency. Rates are a
 * significant-figures problem, not a fixed-decimals one.
 *
 * `rateDecimals` is `private` to the screen file (it has no other caller and should not grow
 * one), so the policy is verified here against a local copy of the same arithmetic, plus a source
 * check that the screen still uses it. The arithmetic is four lines and stating it twice is
 * cheaper than widening the visibility of a UI helper.
 */
class RateDecimalsTest {

    /** Mirrors `rateDecimals` in CurrencyScreen.kt. */
    private fun rateDecimals(value: Double, currencyDecimals: Int): Int {
        val base = if (currencyDecimals > 0) 4 else 2
        if (!value.isFinite() || value <= 0.0 || value >= 1.0) return base
        val leadingZeros = kotlin.math.ceil(-kotlin.math.log10(value)).toInt() - 1
        return kotlin.math.min(8, kotlin.math.max(base, leadingZeros + 4))
    }

    @Test
    fun `a tiny rate gets enough decimals to be readable`() {
        // 1 VND in USD. Four decimals rendered this as 0,0000.
        val decimals = rateDecimals(0.0000383, 2)
        assertTrue("expected more than the old fixed 4, got $decimals", decimals > 4)
        assertEquals("0.00003830", String.format(java.util.Locale.US, "%.${decimals}f", 0.0000383))
    }

    @Test
    fun `a normal rate keeps exactly the old formatting`() {
        // 🚨 The half that must NOT change. Everything at or above 1 already read correctly, and a
        // fix that reformatted those would have traded one cosmetic bug for a wider one.
        assertEquals(4, rateDecimals(26126.87, 2))
        assertEquals(2, rateDecimals(26126.87, 0))
        assertEquals(4, rateDecimals(1.0, 2))
        assertEquals(4, rateDecimals(23.5, 2))
    }

    @Test
    fun `precision is capped so a pathological rate cannot run away`() {
        assertEquals(8, rateDecimals(0.0000000001, 2))
        assertTrue(rateDecimals(1e-30, 2) <= 8)
    }

    @Test
    fun `non-finite and zero fall back to the base, never to a crash`() {
        assertEquals(4, rateDecimals(Double.NaN, 2))
        assertEquals(4, rateDecimals(Double.POSITIVE_INFINITY, 2))
        assertEquals(2, rateDecimals(0.0, 0))
    }

    @Test
    fun `the screen uses the policy for BOTH rate directions`() {
        // The forward line read fine and the inverse did not, so it would be easy to fix only the
        // one that was reported. Both go through the same helper.
        val src = File("src/main/java/com/tappyai/app/currency/CurrencyScreen.kt").readText()
        assertTrue("forward rate line must use rateDecimals", src.contains("formatAmount(rate, rateDecimals(rate, to.decimals)"))
        assertTrue("inverse rate line must use rateDecimals", src.contains("formatAmount(1 / rate, rateDecimals(1 / rate, from.decimals)"))
        assertTrue(
            "the fixed-decimal expression must be gone",
            !src.contains("if (to.decimals > 0) 4 else 2") && !src.contains("if (from.decimals > 0) 4 else 2"),
        )
    }
}
