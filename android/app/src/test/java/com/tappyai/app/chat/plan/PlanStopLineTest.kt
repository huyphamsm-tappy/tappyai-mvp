package com.tappyai.app.chat.plan

import com.tappyai.app.chat.ChatResponseParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Review 01/11 (Android = the web). The web shows a price chip on a stop only when the stop has a price (TripPlanCard.tsx:174); Android printed
 * "chưa có giá — hỏi quán" on EVERY stop without one. The server now sends meal stops with no venue data (category "rest") and walks, so every
 * such stop would carry that sentence. The sentence stays in the data ([NO_PRICE], pinned by PlanCardV2Test); the card draws a price line only for
 * a priced stop. Likewise the description is shown whole (web TripPlanCard.tsx:195): a three-line cut dropped the closing "(chưa xác minh)".
 */
class PlanStopLineTest {
    private fun res(path: String) = File(javaClass.classLoader!!.getResource(path)!!.toURI())
    private val card by lazy { planCardViewOf(ChatResponseParser.parse(res("plan-card/quy-nhon-v2.txt").readText()).plan!!) }
    private fun stop(name: String) = card.days.flatMap { it.stops }.first { it.name == name }
    private fun source(name: String) = File(generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "docs/uat/evidence").isDirectory }, "android/app/src/main/java/com/tappyai/app/chat/$name").readText()

    @Test fun `a priced stop has a price line, an unpriced one has none`() {
        assertEquals("Miễn phí", stop("Tháp Đôi").priceLine)
        assertEquals("300.000đ/người", stop("Hải sản Nhơn Lý").priceLine)
        assertNull(stop("Eo Gió").priceLine) // the model's "chưa có giá" sentinel
        assertNull(stop("Bãi Kỳ Co").priceLine) // no price at all
    }

    @Test fun `the card draws the price line only, and the description whole`() {
        val ui = source("TripPlanCard.kt")
        assertTrue(ui.contains("stop.priceLine?.let"))
        assertFalse(ui.contains("chat_plan_v2_no_price"))
        assertFalse(ui.contains("stop.description?.let { Text(it, color = PlanPal.Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 3"))
    }
}
