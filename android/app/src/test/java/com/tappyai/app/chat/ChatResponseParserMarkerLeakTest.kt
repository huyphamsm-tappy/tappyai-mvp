package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * P0-1 REGRESSION (permanent): no server marker may ever render as message body.
 *
 * WHAT HAPPENED. The server owns a closed set of marker blocks and injects them into the assistant
 * TEXT stream, because text is the only channel that survives persistence and reload. It does not
 * branch on which client is reading. `[TAPPY_SHOPPING]` was added for the web decision card and
 * handled only there, so on Android every shopping turn rendered a block of raw JSON — and it
 * rendered FIRST, because the server emits that block as a `0:` frame right after the tool result,
 * ahead of the prose. `[CTA_BUTTONS]` had already leaked the same way once before.
 *
 * WHY THE TABLE IS EXHAUSTIVE. Fixing the one shape that was reported is what let this recur: a
 * marker leaks in more than one shape, and a test that only covers the reported one goes green
 * while the others stay open. So every marker is checked in every shape the transport can produce:
 *
 *   closed        `[X]…[/X]`                  the normal, complete block
 *   unterminated  `[X]…` at end of snapshot   a block still arriving mid-stream
 *   orphan-open   a lone `[X]`                a block whose body never came
 *   orphan-close  a lone `[/X]`               a block whose opening was consumed upstream
 *
 * ⚠️ THE ASSERTION CHECKS THE PAYLOAD, NOT JUST THE TAG. An earlier version of this file asserted
 * only that the marker NAME was absent, and a mutation proved that worthless: deleting the
 * unterminated-block handler left the orphan-tag safety net to remove `[TAPPY_SHOPPING]` while the
 * JSON body it wrapped stayed in the message. The tag was gone; the user still read raw JSON. So
 * every block body carries a sentinel and the sentinel must be gone too.
 */
class ChatResponseParserMarkerLeakTest {

    /** Every marker name the server can emit. Grown when the server grows, never trimmed. */
    private val markerNames = listOf("TAPPY_PLAN", "CTA_BUTTONS", "FOLLOWUPS", "TAPPY_SHOPPING")

    /**
     * A token that appears ONLY inside a block body, so "the body survived" is directly testable.
     *
     * Deliberately does NOT contain the marker name. A sentinel spelled `PAYLOAD${name}SENTINEL`
     * makes the tag check and the body check fire together — the body check can then never be
     * shown to catch anything on its own, and a reviewer cannot tell which of the two is doing the
     * work. Keeping them independent is what makes the mutation result readable.
     */
    private fun sentinel(name: String) = "ZQSENTINEL${markerNames.indexOf(name)}QZ"

    /** A realistic body for each marker — a malformed one must leak no more than a valid one. */
    private fun bodyFor(name: String) = when (name) {
        "TAPPY_PLAN" ->
            """{"type":"trip","title":"${sentinel(name)}","days":[]}"""
        "CTA_BUTTONS" ->
            """{"buttons":[{"label":"${sentinel(name)}","type":"maps","url":"https://maps.example","primary":true}]}"""
        "FOLLOWUPS" ->
            "${sentinel(name)}|Có chỗ đậu xe không?|Mở cửa mấy giờ?"
        else ->
            """{"v":1,"entities":[{"key":"${sentinel(name)}","config":"M1 · 32GB","offers":[]}],"recommendation":null}"""
    }

    private fun assertClean(case: String, reply: String) {
        val parsed = ChatResponseParser.parse(reply)
        val surfaces = buildList {
            add("text" to parsed.text)
            add("streamText" to parsed.streamText)
            parsed.segments.filterIsInstance<ReplySegment.Text>()
                .forEachIndexed { i, s -> add("segment[$i]" to s.markdown) }
        }
        for ((surfaceName, surface) in surfaces) {
            for (name in markerNames) {
                // The tag itself…
                assertFalse(
                    "$case — `$name` tag leaked into $surfaceName: $surface",
                    surface.contains(name),
                )
                // …and the body it was wrapping. Stripping the tag alone still shows the user JSON.
                assertFalse(
                    "$case — `$name` BODY leaked into $surfaceName: $surface",
                    surface.contains(sentinel(name)),
                )
            }
        }
    }

    @Test
    fun `closed blocks never leak`() {
        for (name in markerNames) {
            assertClean("closed/$name", "Gợi ý đây nhé.\n[$name]${bodyFor(name)}[/$name]")
        }
    }

    @Test
    fun `unterminated blocks at end of a streaming snapshot never leak`() {
        for (name in markerNames) {
            // What the screen parses on the frame BEFORE the closing tag arrives.
            assertClean("unterminated/$name", "Gợi ý đây nhé.\n[$name]${bodyFor(name)}")
        }
    }

    @Test
    fun `orphan opening tags never leak`() {
        for (name in markerNames) {
            assertClean("orphan-open/$name", "Gợi ý đây nhé.\n[$name]\nCòn gì nữa không?")
        }
    }

    @Test
    fun `orphan closing tags never leak`() {
        for (name in markerNames) {
            assertClean("orphan-close/$name", "Gợi ý đây nhé.\n[/$name]\nCòn gì nữa không?")
        }
    }

    @Test
    fun `malformed JSON inside a block never leaks the block`() {
        for (name in markerNames) {
            assertClean("malformed/$name", "Trước.\n[$name]{not json[/$name]\nSau.")
        }
    }

    // ── The production shape this bug actually took ──────────────────────────
    //
    // streamEnrichment emits the shopping block as its own `0:` frame right after the tool result,
    // so it arrives BEFORE any prose. That ordering is why the leak was so visible, and why a test
    // that only puts the marker at the end would have missed how bad it looked.

    @Test
    fun `shopping block arriving before the prose leaves clean prose`() {
        val reply = "[TAPPY_SHOPPING]${bodyFor("TAPPY_SHOPPING")}[/TAPPY_SHOPPING]\n\nMình gợi ý cấu hình này."
        assertClean("early-emit", reply)
        assertEquals("Mình gợi ý cấu hình này.", ChatResponseParser.parse(reply).text)
    }

    @Test
    fun `a full production reply keeps its prose and all four blocks are consumed`() {
        val reply = buildString {
            append("[TAPPY_SHOPPING]").append(bodyFor("TAPPY_SHOPPING")).append("[/TAPPY_SHOPPING]\n\n")
            append("Mình nghiêng về **MacBook Air M1** nhé.\n")
            append("[TAPPY_PLAN]").append(bodyFor("TAPPY_PLAN")).append("[/TAPPY_PLAN]\n")
            append("[CTA_BUTTONS]").append(bodyFor("CTA_BUTTONS")).append("[/CTA_BUTTONS]\n")
            append("[FOLLOWUPS]").append(bodyFor("FOLLOWUPS"))
        }
        assertClean("full-reply", reply)
        val parsed = ChatResponseParser.parse(reply)
        assertTrue("prose must survive", parsed.text.contains("MacBook Air M1"))
    }

    // ── Existing protocols must keep WORKING, not merely stop leaking ────────
    //
    // Stripping is trivially achievable by deleting everything; these pin that the three shipped
    // blocks are still decoded into their models after the new step was inserted into the chain.

    @Test
    fun `CTA buttons are still decoded`() {
        val parsed = ChatResponseParser.parse("Đi thử nhé.\n[CTA_BUTTONS]${bodyFor("CTA_BUTTONS")}[/CTA_BUTTONS]")
        assertEquals(1, parsed.ctaButtons.size)
        // The body reached its MODEL — which is the point of a marker. It just must not reach the
        // message text, and assertClean covers that separately.
        assertEquals(sentinel("CTA_BUTTONS"), parsed.ctaButtons[0].label)
        assertEquals("maps", parsed.ctaButtons[0].type)
    }

    @Test
    fun `followups are still decoded`() {
        val parsed = ChatResponseParser.parse("Gợi ý đây.\n[FOLLOWUPS]${bodyFor("FOLLOWUPS")}")
        assertEquals(
            listOf(sentinel("FOLLOWUPS"), "Có chỗ đậu xe không?", "Mở cửa mấy giờ?"),
            parsed.followups,
        )
    }

    @Test
    fun `CTA buttons are still decoded when a shopping block precedes them`() {
        // The new step runs AFTER CTA in the chain; this pins that inserting it did not shadow the
        // bare-form CTA pattern, which is anchored at end-of-content.
        val reply = "[TAPPY_SHOPPING]${bodyFor("TAPPY_SHOPPING")}[/TAPPY_SHOPPING]\n\n" +
            "Xem thêm nhé.\n[CTA_BUTTONS]${bodyFor("CTA_BUTTONS")}"
        val parsed = ChatResponseParser.parse(reply)
        assertEquals(1, parsed.ctaButtons.size)
        assertClean("shopping-then-cta", reply)
    }

    @Test
    fun `a reply with no markers is returned unchanged`() {
        val parsed = ChatResponseParser.parse("Quán này ngon lắm, bạn thử nhé!")
        assertEquals("Quán này ngon lắm, bạn thử nhé!", parsed.text)
    }

    @Test
    fun `ordinary text mentioning brackets is not eaten`() {
        // The strip patterns must key on the marker names, not on brackets in general.
        val reply = "Cú pháp là [key] và {value} nhé."
        assertEquals(reply, ChatResponseParser.parse(reply).text)
    }
}
