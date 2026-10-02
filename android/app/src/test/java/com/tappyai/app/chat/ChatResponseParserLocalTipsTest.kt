package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** UAT3 P2 (2026-09-27): `local_tips` in the plan JSON reaches Android (web parity). */
class ChatResponseParserLocalTipsTest {

    private fun planWith(extra: String) =
        """Kế hoạch.[TAPPY_PLAN]{"type":"trip","title":"Quy Nhơn","days":[{"label":"Ngày 1","items":[{"time":"07:00","name":"Bánh xèo Bà Đệ"}]}]$extra}[/TAPPY_PLAN]"""

    @Test
    fun `local_tips parse with basis and place`() {
        val plan = ChatResponseParser.parse(planWith(""","local_tips":[{"text":"Gọi bánh xèo tôm nhảy.","basis":"tool","place":"Bánh xèo Bà Đệ"},{"text":"Đi biển sáng sớm.","basis":"general"}]""")).plan!!
        val tips = plan.localTips!!
        assertEquals(2, tips.size)
        assertEquals("tool", tips[0].basis)
        assertEquals("Bánh xèo Bà Đệ", tips[0].place)
        assertEquals("general", tips[1].basis)
        assertNull(tips[1].place)
    }

    @Test
    fun `a plan without local_tips parses as before`() {
        val plan = ChatResponseParser.parse(planWith("")).plan!!
        assertNull(plan.localTips)
        assertEquals("Bánh xèo Bà Đệ", plan.days[0].items[0].name)
    }
}
