package com.tappyai.app.fortune.tuvi

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Golden vectors — the same list is asserted by the web (`canChiEngine.test.ts`) and iOS
 * (`CanChiDataTests.swift`) mirrors. Any change here must be made on all three platforms.
 */
private data class Vector(
    val year: Int,
    val heavenlyStem: String,
    val earthlyBranch: String,
    val canChi: String,
    val napAm: String,
    val element: String,
)

private val VECTORS = listOf(
    Vector(1984, "Giáp", "Tý", "Giáp Tý", "Hải Trung Kim", "Kim"),
    Vector(1985, "Ất", "Sửu", "Ất Sửu", "Hải Trung Kim", "Kim"),
    Vector(1986, "Bính", "Dần", "Bính Dần", "Lư Trung Hỏa", "Hỏa"),
    Vector(1990, "Canh", "Ngọ", "Canh Ngọ", "Lộ Bàng Thổ", "Thổ"),
    Vector(2000, "Canh", "Thìn", "Canh Thìn", "Bạch Lạp Kim", "Kim"),
    Vector(2020, "Canh", "Tý", "Canh Tý", "Bích Thượng Thổ", "Thổ"),
    Vector(1924, "Giáp", "Tý", "Giáp Tý", "Hải Trung Kim", "Kim"),
    Vector(2045, "Ất", "Sửu", "Ất Sửu", "Hải Trung Kim", "Kim"),
)

class FortuneCanChiEngineTest {

    @Test
    fun `tables have 10 stems, 12 branches and 30 nap am entries`() {
        assertEquals(10, HEAVENLY_STEMS.size)
        assertEquals(12, EARTHLY_BRANCHES.size)
        assertEquals(30, NAP_AM.size)
    }

    @Test
    fun `every nap am entry carries a valid element alongside its name`() {
        for (entry in NAP_AM) {
            assertTrue(entry.name.isNotEmpty())
            assertTrue(entry.element in ELEMENTS)
        }
    }

    // Locks the table's element SEQUENCE itself, so a future typo in one row (e.g. the wrong
    // element paired with a napAm name) is caught even though name+element already live together.
    @Test
    fun `the 30 nap am entries follow the canonical element cycle`() {
        val expectedCycle = listOf(
            "Kim", "Hỏa", "Mộc", "Thổ", "Kim", "Hỏa", "Thủy", "Thổ", "Kim", "Mộc",
            "Thủy", "Thổ", "Hỏa", "Mộc", "Thủy", "Kim", "Hỏa", "Mộc", "Thổ", "Kim",
            "Hỏa", "Thủy", "Thổ", "Kim", "Mộc", "Thủy", "Thổ", "Hỏa", "Mộc", "Thủy",
        )
        assertEquals(expectedCycle, NAP_AM.map { it.element })
    }

    @Test
    fun `getAstrologyProfile matches golden vectors`() {
        for (v in VECTORS) {
            val r = getAstrologyProfile(v.year)
            assertEquals("${v.year} heavenlyStem", v.heavenlyStem, r.heavenlyStem)
            assertEquals("${v.year} earthlyBranch", v.earthlyBranch, r.earthlyBranch)
            assertEquals("${v.year} canChi", v.canChi, r.canChi)
            assertEquals("${v.year} napAm", v.napAm, r.napAm)
            assertEquals("${v.year} element", v.element, r.element)
        }
    }

    @Test
    fun `1985 is At Suu Hai Trung Kim Kim (regression - last-digit rule returned Moc)`() {
        val r = getAstrologyProfile(1985)
        assertEquals("Ất", r.heavenlyStem)
        assertEquals("Sửu", r.earthlyBranch)
        assertEquals("Ất Sửu", r.canChi)
        assertEquals("Hải Trung Kim", r.napAm)
        assertEquals("Kim", r.element)
        assertNotEquals("Mộc", r.element)
    }

    @Test
    fun `repeats with a period of 60 years`() {
        for (year in 1900..2100) {
            assertEquals(getAstrologyProfile(year), getAstrologyProfile(year + 60))
        }
    }

    @Test
    fun `yields non-empty fields and a valid element for every year in a 60-year span`() {
        for (year in 1960 until 2020) {
            val r = getAstrologyProfile(year)
            assertTrue(r.heavenlyStem.isNotEmpty())
            assertTrue(r.earthlyBranch.isNotEmpty())
            assertEquals("${r.heavenlyStem} ${r.earthlyBranch}", r.canChi)
            assertTrue(r.napAm.isNotEmpty())
            assertTrue(r.element in ELEMENTS)
        }
    }

    @Test
    fun `covers all 60 stem-branch pairs and all 30 nap am across one cycle`() {
        val pairs = mutableSetOf<String>()
        val napAms = mutableSetOf<String>()
        for (year in 1984 until 2044) {
            val r = getAstrologyProfile(year)
            pairs.add(r.canChi)
            napAms.add(r.napAm)
        }
        assertEquals(60, pairs.size)
        assertEquals(30, napAms.size)
    }

    @Test
    fun `is total for years before AD 4 (no negative-modulo crash)`() {
        val r = getAstrologyProfile(-1)
        assertTrue(r.element in ELEMENTS)
        assertEquals(getAstrologyProfile(59).canChi, r.canChi)
    }

    @Test
    fun `getNguHanhByYear now returns the nap am element`() {
        for (v in VECTORS) {
            assertEquals(v.element, getNguHanhByYear(v.year))
        }
    }

    @Test
    fun `the 12-branch zodiac list still agrees with the engine branch`() {
        for (year in 1960 until 2020) {
            assertEquals(getAstrologyProfile(year).earthlyBranch, getCanChiByYear(year).nameVi)
        }
    }
}
