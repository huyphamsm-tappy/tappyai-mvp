package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pins the per-item plan photo to ITS OWN item.
 *
 * REGRESSION: the server has written `item.photo_url` into the `[TAPPY_PLAN]` JSON since
 * 2026-07-25 (`streamEnrichment.ts::injectPlanPhotos`) and the web renders a thumbnail per item,
 * but Android's `PlanItem` declared no such field — with `ignoreUnknownKeys = true` the value was
 * dropped in silence. These tests fail on any model that loses it, and on any implementation that
 * reaches a photo by array position instead of by the item that carries it.
 */
class ChatResponseParserPlanPhotoTest {

    private fun planOf(itemsJson: String) =
        """Đây là lịch trình.[TAPPY_PLAN]{"title":"Đà Lạt 2 ngày","days":[{"label":"Ngày 1","items":[$itemsJson]}]}[/TAPPY_PLAN]"""

    @Test
    fun `photo_url parses into photoUrl`() {
        val reply = planOf("""{"time":"08:00","name":"Chợ Đà Lạt","photo_url":"https://img.example/cho.jpg"}""")

        val plan = ChatResponseParser.parse(reply).plan
        assertNotNull(plan)

        assertEquals("https://img.example/cho.jpg", plan!!.days[0].items[0].photoUrl)
    }

    @Test
    fun `a plan without photo_url still parses and leaves photoUrl null`() {
        val reply = planOf("""{"time":"08:00","name":"Chợ Đà Lạt","address":"Phường 1"}""")

        val plan = ChatResponseParser.parse(reply).plan!!

        assertNull(plan.days[0].items[0].photoUrl)
        // Everything the card already rendered is untouched.
        assertEquals("Chợ Đà Lạt", plan.days[0].items[0].name)
        assertEquals("Phường 1", plan.days[0].items[0].address)
    }

    @Test
    fun `an explicit null photo_url parses without throwing`() {
        val reply = planOf("""{"time":"08:00","name":"Chợ Đà Lạt","photo_url":null}""")

        assertNull(ChatResponseParser.parse(reply).plan!!.days[0].items[0].photoUrl)
    }

    @Test
    fun `each item keeps its own photo — never a positional or shared mapping`() {
        val reply = planOf(
            """{"time":"08:00","name":"Chợ Đà Lạt","photo_url":"https://img.example/a.jpg"},""" +
                """{"time":"12:00","name":"Quán ăn trưa"},""" +
                """{"time":"19:00","name":"Hồ Xuân Hương","photo_url":"https://img.example/c.jpg"}"""
        )

        val items = ChatResponseParser.parse(reply).plan!!.days[0].items

        assertEquals(3, items.size)
        assertEquals("https://img.example/a.jpg", items[0].photoUrl)
        // The middle item has no photo and must NOT inherit a neighbour's.
        assertNull(items[1].photoUrl)
        assertEquals("https://img.example/c.jpg", items[2].photoUrl)
    }

    @Test
    fun `the rest of the plan contract is unchanged`() {
        val reply = """
            Kế hoạch đây.
            [TAPPY_PLAN]{"title":"Đà Lạt","people":2,"budget_total":"5.000.000đ",
            "cost_breakdown":{"Ăn uống":"1.000.000đ"},"share_text":"Chia sẻ nhé",
            "days":[{"label":"Ngày 1","items":[{"time":"08:00","emoji":"🍜","category":"food",
            "name":"Phở","description":"Ngon","price":"50.000đ","address":"1 Lý Tự Trọng",
            "maps_link":"https://maps.example/1","booking_link":"https://book.example/1",
            "place_id":"p1","photo_url":"https://img.example/pho.jpg"}]}]}[/TAPPY_PLAN]
        """.trimIndent()

        val plan = ChatResponseParser.parse(reply).plan!!
        val item = plan.days[0].items[0]

        assertEquals("Đà Lạt", plan.title)
        assertEquals(2, plan.people)
        assertEquals("5.000.000đ", plan.budgetTotal)
        assertEquals("Chia sẻ nhé", plan.shareText)
        assertEquals("1.000.000đ", plan.costBreakdown?.get("Ăn uống"))
        assertEquals("08:00", item.time)
        assertEquals("🍜", item.emoji)
        assertEquals("food", item.category)
        assertEquals("Phở", item.name)
        assertEquals("Ngon", item.description)
        assertEquals("50.000đ", item.price)
        assertEquals("1 Lý Tự Trọng", item.address)
        assertEquals("https://maps.example/1", item.mapsLink)
        assertEquals("https://book.example/1", item.bookingLink)
        assertEquals("p1", item.placeId)
        assertEquals("https://img.example/pho.jpg", item.photoUrl)
        // The marker never reaches the user, as before.
        assertEquals("Kế hoạch đây.", ChatResponseParser.parse(reply).text)
    }
}
