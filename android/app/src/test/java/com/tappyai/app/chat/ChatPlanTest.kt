package com.tappyai.app.chat

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the two pure pieces of the `[TAPPY_PLAN]` + incremental-streaming work:
 *  - [streamingDisplayText] never leaks a marker (complete OR partial-trailing) into the bubble
 *    while a reply streams, since the model appends its markers at the end (web parity: useSmoothText
 *    lag hides them there implicitly).
 *  - [TripPlan] deserializes the plan JSON with the exact snake_case wire keys — a silent rename
 *    would drop the itinerary against prod data.
 */
class ChatPlanTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }

    @Test
    fun `streaming text hides a complete plan marker`() {
        val raw = "Here is your trip!\n[TAPPY_PLAN]{\"title\":\"x\"}[/TAPPY_PLAN]"
        assertEquals("Here is your trip!", streamingDisplayText(raw))
    }

    @Test
    fun `streaming text hides a partial trailing marker`() {
        assertEquals("Here is your trip!", streamingDisplayText("Here is your trip!\n[TAPPY_P"))
        assertEquals("Almost there", streamingDisplayText("Almost there ["))
        // The earliest marker wins when several are present.
        assertEquals("Body", streamingDisplayText("Body[CTA_BUTTONS]{}[/CTA_BUTTONS][FOLLOWUPS]a|b"))
    }

    @Test
    fun `streaming text passes clean text through untouched`() {
        val clean = "Just a normal reply with no markers."
        assertEquals(clean, streamingDisplayText(clean))
        assertFalse(streamingDisplayText("A [bracket] that is not a marker").isEmpty())
    }

    @Test
    fun `plan JSON deserializes snake_case wire keys`() {
        val payload = """
            {"type":"trip","title":"Đà Lạt 2N1Đ","people":2,"budget_total":"3.000.000đ",
             "days":[{"label":"Ngày 1","items":[
               {"time":"08:00","emoji":"🏨","category":"hotel","name":"Ana Mandara",
                "price":"1.2tr","address":"Đà Lạt","maps_link":"https://maps.example",
                "booking_link":"https://book.example","place_id":"p1","photo_url":"https://img.example"}
             ]}],
             "cost_breakdown":{"Khách sạn":"1.2tr"},"share_text":"share me"}
        """.trimIndent()

        val plan = json.decodeFromString<TripPlan>(payload)
        assertEquals("trip", plan.type)
        assertEquals(2, plan.people)
        assertEquals("3.000.000đ", plan.budgetTotal)
        assertEquals("share me", plan.shareText)
        assertEquals(mapOf("Khách sạn" to "1.2tr"), plan.costBreakdown)

        val item = plan.days.single().items.single()
        assertEquals("hotel", item.category)
        assertEquals("https://maps.example", item.mapsLink)
        assertEquals("https://book.example", item.bookingLink)
        assertEquals("p1", item.placeId)
        assertEquals("https://img.example", item.photoUrl)
        assertTrue(plan.days.single().items.isNotEmpty())
    }
}
