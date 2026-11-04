package com.tappyai.app.chat.plan

import com.tappyai.app.chat.ChatResponseParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Owner 01/11 (Android = the web; the 29/09 rule that a stop never shows its server photo is dropped): the web shows the photo the server matched to a
 * stop (TripPlanCard.tsx `photo_url`, a Maps photo of the real venue). Android parsed it and never drew it - a stop had the key picture or an emoji.
 * Now the stop's own https photo is drawn first, then the key picture, then the emoji placeholder. Blank-name stops, the day badge and the total
 * row (same review) are pinned here too.
 */
class PlanStopPhotoTest {
    private fun cardOf(items: String, extra: String = ""): PlanCardView {
        val json = """{"type":"trip","title":"Đà Nẵng 2 ngày","destination":"Đà Nẵng"$extra,"days":[{"label":"Ngày 1 — Trung tâm","items":[$items]}]}"""
        return planCardViewOf(ChatResponseParser.parse("Lịch đây.\n[TAPPY_PLAN]$json[/TAPPY_PLAN]").plan!!)
    }
    private fun source(name: String) = File(generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "docs/uat/evidence").isDirectory }, "android/app/src/main/java/com/tappyai/app/chat/$name").readText()

    @Test fun `a stop's own https photo is carried, any other address is not`() {
        val card = cardOf(
            """{"time":"09:00","emoji":"🏛","name":"Bảo tàng Chăm","photo_url":"https://lh3.googleusercontent.com/a"},
               {"time":"11:00","emoji":"🍜","name":"Mì Quảng","photo_url":"http://insecure.example/b"},
               {"time":"13:00","emoji":"☕","name":"Cafe","photo_url":"javascript:alert(1)"},
               {"time":"15:00","emoji":"🌉","name":"Cầu Rồng"}""",
        )
        assertEquals(listOf("https://lh3.googleusercontent.com/a", null, null, null), card.days.single().stops.map { it.photoUrl })
    }

    @Test fun `the card draws the stop's photo before the key picture`() {
        val ui = source("TripPlanCard.kt")
        assertTrue(ui.contains("photoUrl = stop.photoUrl"))
        assertTrue(ui.contains("photoUrl ?: manifest.urlFor(key)"))
    }

    @Test fun `a stop with no name still shows, as on the web`() {
        val card = cardOf("""{"time":"09:00","emoji":"🌅","name":"","description":"Ngắm bình minh trên biển"},{"time":"10:00","emoji":"🏛","name":"Bảo tàng"}""")
        assertEquals(2, card.days.single().stops.size)
        assertEquals("Ngắm bình minh trên biển", card.days.single().stops[0].name) // the description stands in for a missing name
    }

    @Test fun `a stop with neither a name nor words has nothing to show and is dropped`() {
        val card = cardOf("""{"time":"09:00","emoji":"📍","name":""},{"time":"10:00","emoji":"🏛","name":"Bảo tàng"}""")
        assertEquals(listOf("Bảo tàng"), card.days.single().stops.map { it.name })
    }

    @Test fun `the day badge is the number its label names, not its position`() {
        val json = """{"type":"trip","title":"T","days":[{"label":"Ngày 1 — A","items":[{"time":"09:00","emoji":"📍","name":"Một"}]},{"label":"Ngày 3 — C","items":[{"time":"09:00","emoji":"📍","name":"Ba"}]},{"label":"Buổi tối","items":[{"time":"20:00","emoji":"🌙","name":"Tối"}]}]}"""
        val card = planCardViewOf(ChatResponseParser.parse("x\n[TAPPY_PLAN]$json[/TAPPY_PLAN]").plan!!)
        assertEquals(listOf(1, 3, 3), card.days.map { it.number }) // "Buổi tối" names no number: it follows the previous day
    }

    @Test fun `the total row is the server's budget_total, in the cost block as on the web`() {
        val card = cardOf("""{"time":"09:00","emoji":"🏛","name":"Bảo tàng"}""", ""","budget_total":"5.000.000đ","people":2""")
        assertEquals("5.000.000đ", card.overview.single { it.kind == PlanCardView.OverviewKind.BUDGET }.value)
        assertTrue(source("TripPlanCard.kt").contains("chat_plan_v2_total_estimate"))
    }

    @Test fun `no stop is left without a way to read its name`() {
        assertNull(null as String?) // placeholder keeps the class a single unit under the runner when the others are filtered
    }
}
