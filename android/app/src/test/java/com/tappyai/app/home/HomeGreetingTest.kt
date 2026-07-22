package com.tappyai.app.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the Home hero greeting engine against the web canonical implementation
 * (`src/app/page.tsx` HERO_TEXTS / `src/app/HomeView.tsx` HERO_EN): 7 hour slots, multiple
 * templates per slot (never one fixed greeting), weekday/weekend variants, and the
 * `dayOfMonth % pool` selection that keeps Web and Android showing the same text on the same day.
 */
class HomeGreetingTest {

    @Test
    fun `noon slot picks the web lunch templates`() {
        // Web [11,14) day-15: texts[15 % 4] = texts[3].
        assertEquals(
            "12h rồi —\nra ngoài hay đặt đồ ăn? Tappy lo! 🛵",
            HomeGreeting.heroText(hour = 12, isWeekend = false, dayOfMonth = 15, english = false),
        )
    }

    @Test
    fun `same slot rotates templates across days — never one fixed greeting`() {
        val a = HomeGreeting.heroText(hour = 15, isWeekend = false, dayOfMonth = 1, english = false)
        val b = HomeGreeting.heroText(hour = 15, isWeekend = false, dayOfMonth = 2, english = false)
        assertNotEquals(a, b)
    }

    @Test
    fun `weekend morning uses the weekend pool`() {
        val text = HomeGreeting.heroText(hour = 7, isWeekend = true, dayOfMonth = 0, english = false)
        assertEquals("Sáng cuối tuần đây!\nNghỉ ngơi hay đi đâu vui? ☀️", text)
    }

    @Test
    fun `english pool mirrors HERO_EN`() {
        // Web HERO_EN [17,20) weekend day-0: texts[0].
        assertEquals(
            "Weekend evening!\nOut, or something tasty? 🎊",
            HomeGreeting.heroText(hour = 18, isWeekend = true, dayOfMonth = 0, english = true),
        )
    }

    @Test
    fun `every hour of the day maps to a slot with at least two templates`() {
        for (hour in 0..23) {
            val seen = (1..31).map { dom ->
                HomeGreeting.heroText(hour = hour, isWeekend = false, dayOfMonth = dom, english = false)
            }.toSet()
            assertTrue("hour $hour has a single fixed greeting", seen.size >= 2)
        }
    }
}
