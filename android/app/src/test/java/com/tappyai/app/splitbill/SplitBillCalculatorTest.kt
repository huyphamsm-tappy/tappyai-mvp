package com.tappyai.app.splitbill

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the split-bill arithmetic against the web `/split-bill` page. Pure math, so fully unit-
 * testable — this is the automatable core of the feature.
 */
class SplitBillCalculatorTest {

    @Test
    fun `custom tip overrides preset, blank falls back to preset`() {
        assertEquals(10.0, SplitBillCalculator.activeTipPercent(tipPreset = 5, customTip = "10"), 0.0)
        assertEquals(5.0, SplitBillCalculator.activeTipPercent(tipPreset = 5, customTip = ""), 0.0)
        // Unparseable custom counts as 0 (web `parseFloat(...) || 0`).
        assertEquals(0.0, SplitBillCalculator.activeTipPercent(tipPreset = 15, customTip = "abc"), 0.0)
    }

    @Test
    fun `parseAmount strips non-numeric like the web`() {
        assertEquals(1200000.0, SplitBillCalculator.parseAmount("1.200.000 đ".replace(".", "")), 0.0)
        assertEquals(500.0, SplitBillCalculator.parseAmount("500"), 0.0)
        assertEquals(0.0, SplitBillCalculator.parseAmount(""), 0.0)
    }

    @Test
    fun `equal split with tip matches web math`() {
        // total 400,000, 10% tip, 4 people → grand 440,000 → 110,000 each.
        val tip = SplitBillCalculator.activeTipPercent(0, "10")
        val grand = SplitBillCalculator.grandTotal(400_000.0, tip)
        assertEquals(440_000.0, grand, 0.01)
        assertEquals(110_000.0, SplitBillCalculator.perPerson(grand, 4), 0.01)
        assertEquals(40_000.0, SplitBillCalculator.tipAmount(400_000.0, tip), 0.01)
    }

    @Test
    fun `per person is zero when people is zero`() {
        assertEquals(0.0, SplitBillCalculator.perPerson(100.0, 0), 0.0)
    }

    @Test
    fun `custom person share is grossed up by tip`() {
        // 200,000 at 15% → 230,000.
        assertEquals(230_000.0, SplitBillCalculator.personShare(200_000.0, 15.0), 0.01)
        assertEquals(200_000.0, SplitBillCalculator.personShare(200_000.0, 0.0), 0.01)
    }
}
