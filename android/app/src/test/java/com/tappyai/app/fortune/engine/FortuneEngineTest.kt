package com.tappyai.app.fortune.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Golden cross-platform determinism test for the fortune engine. The hash values are computed from
 * the SAME djb2 algorithm the web ships (`fortuneEngine.ts`), so these pin byte-identical behaviour
 * and guard the two parity traps: the `Math.abs`/`Int.MIN_VALUE` widening and the ISO-week/UTC+7 key.
 */
class FortuneEngineTest {

    @Test
    fun `djb2 matches web golden hashes`() {
        // Reference values produced by the web algorithm: h=5381; h=(h*33+code)|0; abs(h).
        assertEquals(673733197L, hashString("aries|2026-07"))
        assertEquals(470602555L, hashString("aries|2026-07|love"))
        assertEquals(283486082L, hashString("ty2|2026-07"))
        assertEquals(1898265348L, hashString("aries|2026-W01|score"))
    }

    @Test
    fun `hash is never negative`() {
        listOf("", "a", "ty2|2026-12-31|health", "leo|2026-W53|color", "capricorn|2026-02")
            .forEach { assertTrue("hash($it) must be >= 0", hashString(it) >= 0) }
    }

    @Test
    fun `period key uses VN calendar year + ISO week`() {
        val d = LocalDate.of(2026, 7, 15)
        assertEquals("2026-07-15", getPeriodKey(FortunePeriod.Day, d).key)
        assertEquals("2026-07", getPeriodKey(FortunePeriod.Month, d).key)
        // 2026-01-01 is a Thursday → ISO week 1, calendar year 2026.
        assertEquals("2026-W01", getPeriodKey(FortunePeriod.Week, LocalDate.of(2026, 1, 1)).key)
    }

    @Test
    fun `generateFortune picks deterministically from the banks`() {
        val banks = FortuneBanks(
            love = listOf("L0", "L1", "L2", "L3", "L4", "L5"),
            career = listOf("C0", "C1"),
            money = listOf("M0", "M1"),
            health = listOf("H0", "H1"),
            luckyNumbers = listOf(7, 8, 9),
            luckyColors = listOf("Đỏ", "Cam"),
        )
        val d = LocalDate.of(2026, 7, 15) // key "2026-07", seed "aries|2026-07"
        val r = generateFortune("aries", FortunePeriod.Month, banks, d)
        // love index = hash("aries|2026-07|love") % 6 = 470602555 % 6 = 1
        assertEquals("L1", r.love)
        assertEquals("Tháng này", r.periodLabel)
        assertTrue(r.score in 3..5)
        assertTrue(r.luckyNumber in banks.luckyNumbers)
        // Deterministic: a second call with the same inputs is identical.
        assertEquals(r, generateFortune("aries", FortunePeriod.Month, banks, d))
    }
}
