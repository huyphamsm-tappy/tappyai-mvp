package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * One rule, checked the same way for every marker the backend emits: whatever the block looks like
 * on the wire, its raw text never reaches the user and the prose around it survives intact.
 *
 * The per-marker suites next door check what each payload MEANS. This one checks the property they
 * share — that a well-formed, a truncated and a corrupt block all end the same way, invisible. It
 * exists because the three failures have different causes: a closed block is removed by its own
 * pattern, a truncated one only by a separate end-anchored guard, and a corrupt one only if
 * stripping is independent of whether the JSON parsed.
 *
 * Payloads are the canonical ones: `[TAPPY_PLACES]` is the v1 `{v, items}` block decoded into
 * [PersistedPlace] (never a `places` array), `[TAPPY_SHOPPING]` decodes into
 * [ShoppingDecisionView].
 */
class ChatMarkerSafetyTest {

    private val prose = "Mình gợi ý vài chỗ cho bạn nhé."

    /** Every marker name that may appear on the wire — nothing from this list may survive parsing. */
    private val markerNames = listOf("TAPPY_PLAN", "TAPPY_SHOPPING", "TAPPY_PLACES", "CTA_BUTTONS", "FOLLOWUPS")

    private fun assertNothingLeaked(parsed: ParsedAssistantReply) {
        for (name in markerNames) {
            assertFalse("[$name] leaked into text", parsed.text.contains(name, ignoreCase = true))
            assertFalse("[$name] leaked into streamText", parsed.streamText.contains(name, ignoreCase = true))
            for (segment in parsed.segments) {
                if (segment is ReplySegment.Text) {
                    assertFalse("[$name] leaked into a segment", segment.markdown.contains(name, ignoreCase = true))
                }
            }
        }
    }

    // ── Well-formed ──────────────────────────────────────────────────────────

    @Test
    fun `a closed block of every marker is parsed and stripped, and the prose survives`() {
        val parsed = ChatResponseParser.parse(
            prose +
                """[TAPPY_PLAN]{"title":"Đà Lạt","days":[{"label":"Ngày 1","items":[{"time":"09:00","name":"Quán A"}]}]}[/TAPPY_PLAN]""" +
                """[TAPPY_SHOPPING]{"v":1,"entities":[{"key":"k","name":"Sony WH-1000XM5"}]}[/TAPPY_SHOPPING]""" +
                """[TAPPY_PLACES]{"v":1,"items":[{"id":"place:osm:1","domain":"food","kind":"place","rank":0,"name":"Quán A"}]}[/TAPPY_PLACES]""" +
                """[CTA_BUTTONS]{"buttons":[{"label":"Chỉ đường","type":"maps","url":"https://maps.example/a"}]}[/CTA_BUTTONS]""" +
                "[FOLLOWUPS]Hỏi thêm|Tìm thêm[/FOLLOWUPS]",
        )

        assertEquals(prose, parsed.text)
        assertNotNull(parsed.plan)
        assertNotNull(parsed.shopping)
        assertEquals(1, parsed.places.size)
        assertEquals(1, parsed.ctaButtons.size)
        assertEquals(listOf("Hỏi thêm", "Tìm thêm"), parsed.followups)
        assertNothingLeaked(parsed)
    }

    // ── Truncated ────────────────────────────────────────────────────────────

    @Test
    fun `a plan cut off mid-stream is stripped instead of shown`() {
        val parsed = ChatResponseParser.parse("$prose[TAPPY_PLAN]{\"title\":\"Đà Lạt\",\"days\":[{\"lab")

        assertEquals(prose, parsed.text)
        assertNull(parsed.plan)
        assertNothingLeaked(parsed)
    }

    @Test
    fun `a shopping block cut off mid-stream is stripped instead of shown`() {
        val parsed = ChatResponseParser.parse("$prose[TAPPY_SHOPPING]{\"v\":1,\"entities\":[{\"key\"")

        assertEquals(prose, parsed.text)
        assertNull(parsed.shopping)
        assertNothingLeaked(parsed)
    }

    @Test
    fun `a places block cut off mid-stream is stripped instead of shown`() {
        val parsed = ChatResponseParser.parse("$prose[TAPPY_PLACES]{\"v\":1,\"items\":[{\"name\":\"Quán")

        assertEquals(prose, parsed.text)
        assertTrue(parsed.places.isEmpty())
        assertNothingLeaked(parsed)
    }

    @Test
    fun `a cta block cut off mid-object is stripped instead of shown`() {
        // The end-anchored fallback only matches a block that at least closes its JSON, so this one
        // used to match nothing and stay visible.
        val parsed = ChatResponseParser.parse("$prose[CTA_BUTTONS]{\"buttons\":[{\"label\":\"Chỉ đ")

        assertEquals(prose, parsed.text)
        assertTrue(parsed.ctaButtons.isEmpty())
        assertNothingLeaked(parsed)
    }

    @Test
    fun `a followups line cut off mid-stream is stripped instead of shown`() {
        val parsed = ChatResponseParser.parse("$prose[FOLLOWUPS]Hỏi thêm|Tìm")

        assertEquals(prose, parsed.text)
        assertNothingLeaked(parsed)
    }

    // ── Corrupt ──────────────────────────────────────────────────────────────

    @Test
    fun `a closed block whose json is corrupt is still stripped and yields nothing`() {
        val parsed = ChatResponseParser.parse(
            prose +
                "[TAPPY_PLAN]{not json at all}[/TAPPY_PLAN]" +
                "[TAPPY_SHOPPING]{not json at all}[/TAPPY_SHOPPING]" +
                "[TAPPY_PLACES]{not json at all}[/TAPPY_PLACES]" +
                "[CTA_BUTTONS]{not json at all}[/CTA_BUTTONS]",
        )

        assertEquals(prose, parsed.text)
        assertNull(parsed.plan)
        assertNull(parsed.shopping)
        assertTrue(parsed.places.isEmpty())
        assertTrue(parsed.ctaButtons.isEmpty())
        assertNothingLeaked(parsed)
    }

    @Test
    fun `an orphan closing tag with no opener never shows`() {
        val parsed = ChatResponseParser.parse("$prose[/TAPPY_PLACES][/FOLLOWUPS][/CTA_BUTTONS]")

        assertNothingLeaked(parsed)
    }

    // ── Payload shape ────────────────────────────────────────────────────────

    @Test
    fun `unknown fields are ignored and absent optional fields stay null across every payload`() {
        val parsed = ChatResponseParser.parse(
            prose +
                """[TAPPY_PLAN]{"title":"Đà Lạt","tomorrowsField":1,"days":[{"label":"Ngày 1","items":[{"time":"09:00","name":"Quán A","futureField":true}]}]}[/TAPPY_PLAN]""" +
                """[TAPPY_SHOPPING]{"v":1,"futureField":"x","entities":[{"key":"k","name":"Sony WH-1000XM5","futureField":[1]}]}[/TAPPY_SHOPPING]""" +
                """[TAPPY_PLACES]{"v":1,"futureField":{},"items":[{"id":"place:osm:1","name":"Quán A","futureField":null}]}[/TAPPY_PLACES]""",
        )

        val item = parsed.plan!!.days.first().items.first()
        assertNull(item.photoUrl)
        assertNull(item.description)

        val entity = parsed.shopping!!.entities.first()
        assertEquals("Sony WH-1000XM5", entity.displayName)
        assertEquals(ShoppingMatch.UNKNOWN, entity.matchesRequest)
        assertNull(entity.priceLow)
        assertTrue(entity.offers.isEmpty())

        val place = parsed.places.first()
        assertEquals("Quán A", place.name)
        assertEquals(0, place.rank)
        assertNull(place.image)
        assertNull(place.address)
        assertNull(place.rating)
        assertNull(place.distanceKm)
        assertTrue(place.actions.isEmpty())
        // A named durable place projects to a card; the absent optional fields stay absent on it.
        assertNotNull(place.toCardView())
        assertNull(place.toCardView()!!.address)

        assertNothingLeaked(parsed)
    }

    @Test
    fun `a reply carrying no markers at all is returned untouched`() {
        val plain = "Mình chưa tìm được quán phù hợp. Bạn thử đổi khu vực xem sao?"
        val parsed = ChatResponseParser.parse(plain)

        assertEquals(plain, parsed.text)
        assertEquals(plain, parsed.streamText)
        assertNull(parsed.plan)
        assertNull(parsed.shopping)
        assertTrue(parsed.places.isEmpty())
        assertTrue(parsed.ctaButtons.isEmpty())
        assertTrue(parsed.followups.isEmpty())
    }
}
