package com.tappyai.app.chat.plan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Review 01/11 (Android = the web). The web's plan card is split into day tabs on every build and draws only the active day (TripPlanCard.tsx;
 * owner 02/11 "the designed day tabs on the one-brain build too"). Android stacked every day one under the other, which made a five-day plan a
 * very long card. The card now has a row of day tabs and draws one day; [dayTabIndex] keeps the chosen tab inside the days the card has.
 */
class PlanDayTabsTest {
    private fun source() = File(generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "docs/uat/evidence").isDirectory }, "android/app/src/main/java/com/tappyai/app/chat/TripPlanCard.kt").readText()

    @Test fun `the chosen tab stays inside the days the card has`() {
        assertEquals(0, dayTabIndex(0, 3))
        assertEquals(2, dayTabIndex(2, 3))
        assertEquals(2, dayTabIndex(7, 3)) // the plan shrank after a new answer
        assertEquals(0, dayTabIndex(-1, 3))
        assertEquals(0, dayTabIndex(4, 0)) // no days at all
    }

    @Test fun `the card draws day tabs and one day, not every day stacked`() {
        val ui = source()
        assertTrue(ui.contains("DayTabs("))
        assertTrue(ui.contains("dayTabIndex("))
        assertFalse(ui.contains("view.days.forEach { day -> DayBlock("))
    }
}
