package com.tappyai.app.planner

import com.tappyai.app.history.Conversation
import com.tappyai.app.history.ConversationWithMessages
import com.tappyai.app.history.StoredChatMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The AI Planner's derivation, pinned against the web's `derivePlans.test.ts` behaviour: every
 * `[TAPPY_PLAN]` an assistant turn carried is one card; nothing is invented for a plan that did
 * not say it (no kind, no people, no budget, no cover); the facets row exists only with 2+ kinds.
 */
class DerivePlansTest {

    private fun row(id: String, title: String, vararg messages: StoredChatMessage) = ConversationWithMessages(
        conversation = Conversation(id = id, title = title, category = "travel", updatedAtMillis = 1_000L, messageCount = messages.size),
        messages = messages.toList(),
    )

    private val trip = """Kế hoạch đây.[TAPPY_PLAN]{"type":"trip","title":"Đà Lạt 2 ngày","people":2,"budget_total":"5 triệu",
        "days":[{"label":"Ngày 1","items":[{"time":"08:00","emoji":"🍜","name":"Phở","category":"food","photo_url":"https://img.example/pho.jpg","maps_link":"https://maps.example/1"},
        {"time":"10:00","name":"Hồ Xuân Hương","category":"sight"}]},{"label":"Ngày 2","items":[{"name":"Chợ Đà Lạt"},{"name":"Đồi chè"}]}]}[/TAPPY_PLAN]"""
    private val evening = """[TAPPY_PLAN]{"type":"evening","title":"","days":[{"label":"Tối","items":[{"name":"Bún bò"}]}]}[/TAPPY_PLAN]"""

    @Test
    fun `one card per plan block, with only the facts the plan carries`() {
        val plans = DerivePlans.derivePlans(listOf(row("c1", "Chuyến đi", StoredChatMessage("user", "đi đâu"), StoredChatMessage("assistant", trip))))
        assertEquals(1, plans.size)
        val p = plans.single()
        assertEquals("c1#1", p.id)
        assertEquals("c1", p.conversationId)
        assertEquals("Đà Lạt 2 ngày", p.title)
        assertEquals(PlanKind.Trip, p.kind)
        assertEquals(2, p.people)
        assertEquals("5 triệu", p.budgetTotal)
        assertEquals(2, p.dayCount)
        assertEquals(4, p.stopCount)
        assertEquals("https://img.example/pho.jpg", p.coverUrl)
        assertEquals(listOf("Phở", "Hồ Xuân Hương", "Chợ Đà Lạt"), p.stops.map { it.name })
        assertEquals(1_000L, p.updatedAtMillis)
    }

    @Test
    fun `a plan with no title falls back to the conversation title, and a missing kind stays null`() {
        val plans = DerivePlans.derivePlans(listOf(row("c2", "Tối nay đi đâu", StoredChatMessage("assistant", evening))))
        assertEquals("Tối nay đi đâu", plans.single().title)
        assertEquals(PlanKind.Evening, plans.single().kind)
        assertNull(plans.single().people)
        assertNull(plans.single().budgetTotal)
        assertNull(plans.single().coverUrl)
        val untyped = evening.replace("\"type\":\"evening\",", "")
        assertNull(DerivePlans.derivePlans(listOf(row("c3", "x", StoredChatMessage("assistant", untyped)))).single().kind)
    }

    @Test
    fun `user turns, plain replies and unnamed plans produce no card`() {
        val rows = listOf(
            row("c4", "", StoredChatMessage("user", trip)),
            row("c5", "", StoredChatMessage("assistant", "Không có kế hoạch nào ở đây.")),
            row("c6", "", StoredChatMessage("assistant", evening)), // no plan title, no conversation title
        )
        assertTrue(DerivePlans.derivePlans(rows).isEmpty())
    }

    @Test
    fun `facets only when both kinds are present`() {
        val onlyTrips = DerivePlans.derivePlans(listOf(row("c1", "a", StoredChatMessage("assistant", trip))))
        assertTrue(DerivePlans.facets(onlyTrips).isEmpty())
        val both = onlyTrips + DerivePlans.derivePlans(listOf(row("c2", "b", StoredChatMessage("assistant", evening))))
        assertEquals(listOf(PlanKind.Trip, PlanKind.Evening), DerivePlans.facets(both))
    }
}
