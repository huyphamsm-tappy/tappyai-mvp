package com.tappyai.app.fortune.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Determinism + data-ordering guard for the tu-vi By-Year / Lifetime engine. Together with the
 * count-verified banks and the djb2 golden test ([FortuneEngineTest]), this pins byte-identical
 * output. Also validates the YEAR_COMPAT ordering (indexed by branch-offset `diff`, not literal
 * source order): a self-year (diff 0) must be "Năm bản mệnh".
 */
class FortuneTuViEngineTest {

    // 1990 → can-chi index ((1990-4)%12)=6 = Ngọ (seed "ngo"); 2026 → index 6 too → diff 0.
    @Test
    fun `year fortune self-year is Nam ban menh and is deterministic`() {
        val r = generateYearFortune("ngo", birthYear = 1990, targetYear = 2026)
        assertEquals("Ngọ", r.yearAnimal)
        assertEquals("Năm 2026 (Ngọ)", r.periodLabel)
        assertEquals("⚠ Năm bản mệnh", r.compatLabel) // YEAR_COMPAT[0] — validates key-ordering
        assertTrue(r.score in 3..5)
        assertEquals(r, generateYearFortune("ngo", 1990, 2026))
    }

    @Test
    fun `monthly breakdown is 12 months, named and deterministic`() {
        val months = generateMonthlyBreakdown("ngo", 1990, 6, 15, 2026)
        assertEquals(12, months.size)
        assertEquals("Tháng 1", months.first().monthName)
        assertEquals("Tháng 12", months.last().monthName)
        assertTrue(months.all { it.score in 2..5 })
        assertEquals(months, generateMonthlyBreakdown("ngo", 1990, 6, 15, 2026))
    }

    @Test
    fun `life stages are the 4 web stages and deterministic`() {
        val stages = generateLifeStages("ngo", birthMonth = 6, birthDay = 15)
        assertEquals(4, stages.size)
        assertEquals(listOf("Thời niên thiếu", "Thanh niên", "Trung niên", "Hậu vận"), stages.map { it.label })
        assertEquals(listOf("0 – 18 tuổi", "18 – 30 tuổi", "30 – 50 tuổi", "50+ tuổi"), stages.map { it.ageRange })
        assertEquals(stages, generateLifeStages("ngo", 6, 15))
    }
}
