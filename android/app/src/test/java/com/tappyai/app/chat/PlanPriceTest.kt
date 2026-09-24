package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * "chưa có giá" was painted in the PRICE slot of the plan card (a price chip, the budget row). A data
 * marker is never a value. Mirrors src/lib/plans/planPrice.test.ts so both platforms agree.
 */
class PlanPriceTest {

    @Test
    fun keepsActualAmountsAndFree() {
        for (v in listOf("150.000đ", "~150.000đ/người", "200k", "1,2 triệu", "5.000.000 VND", "\$25", "Miễn phí", "miễn phí vào cửa", "Free", "0đ")) {
            assertEquals(v, PlanPrice.amount(v))
        }
    }

    @Test
    fun dropsSentinelsAndNonAmounts() {
        for (v in listOf("chưa có giá", "Chưa có giá", "price not available", "chưa rõ giá", "\$\$", "Liên hệ", "tùy", "N/A", "unknown", "", "   ", "chưa có giá (2 người)")) {
            assertNull("expected $v to be dropped", PlanPrice.amount(v))
        }
        assertNull(PlanPrice.amount(null))
    }

    @Test
    fun parserProjectsTheRealUatPlan() {
        // The shape of the real plan behind /plan/cZAI86wdjVH7 (2026-09-24).
        val reply = ChatResponseParser.parse(
            "Đây là lịch trình\n[TAPPY_PLAN]{\"type\":\"trip\",\"title\":\"Đà Lạt\",\"people\":2,\"budget_total\":\"chưa có giá\"," +
                "\"cost_breakdown\":{\"Khách sạn\":\"chưa có giá\",\"Quảng trường\":\"Miễn phí\",\"Ăn tối\":\"250.000đ\"}," +
                "\"days\":[{\"label\":\"Ngày 1\",\"items\":[{\"time\":\"08:00\",\"name\":\"MerPerle\",\"price\":\"chưa có giá\"}," +
                "{\"time\":\"12:00\",\"name\":\"Quảng trường Lâm Viên\",\"price\":\"Miễn phí\"}," +
                "{\"time\":\"17:30\",\"name\":\"Tiệm ăn\",\"price\":\"120.000đ/người\"}]}]}[/TAPPY_PLAN]",
        )
        val plan = reply.plan!!
        assertNull(plan.budgetTotal)
        assertEquals(mapOf("Quảng trường" to "Miễn phí", "Ăn tối" to "250.000đ"), plan.costBreakdown)
        assertEquals(listOf(null, "Miễn phí", "120.000đ/người"), plan.days[0].items.map { it.price })
        assertEquals(listOf("MerPerle", "Quảng trường Lâm Viên", "Tiệm ăn"), plan.days[0].items.map { it.name })
        // The verbatim block still goes to the server, which re-projects it (planShare.ts).
        assertFalse(reply.planJson.isNullOrBlank())
    }
}
