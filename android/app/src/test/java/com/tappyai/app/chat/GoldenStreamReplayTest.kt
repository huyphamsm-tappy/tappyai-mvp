package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChatStreamEvent
import com.tappyai.app.chat.data.ChatStreamFrames
import com.tappyai.core.designsystem.component.markdownVisibleText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The replay procedure of docs/consultative/OUTPUT-CONTRACT-6-DOMAINS.md §5, offline.
 *
 * The golden set stores each turn's settled TEXT (markers included) but its `annotations` are the web
 * harness's summaries, not wire frames, and the raw-bytes store (§5 "planned storage") was never
 * uploaded. So each turn is re-framed the way the server sends it — a progress `8:`, tool `9:`/`a:`,
 * step `f:`/`e:`, an unknown `8:` kind, the text split over several `0:` deltas, `d:` — and fed line
 * by line through the production [ChatStreamFrames]. (c) uses a synthetic wire-shaped places frame;
 * (d) label keys are pinned by the shared CCP fixture test (`shared/ccp/commerce-action-fixtures.json`).
 */
class GoldenStreamReplayTest {

    private data class Turn(val name: String, val text: String)

    private val turns: List<Turn> by lazy {
        val dir = File(javaClass.classLoader!!.getResource("golden")!!.toURI())
        dir.listFiles { f -> f.name.endsWith(".json") }!!.sortedBy { it.name }.flatMap { f ->
            Json.parseToJsonElement(f.readText()).jsonObject["turns"]!!.jsonArray.mapIndexedNotNull { i, t ->
                val text = (t as JsonObject)["text"]?.jsonPrimitive?.content
                if (text.isNullOrBlank()) null else Turn("${f.name}#$i", text)
            }
        }
    }

    private fun frame(code: String, payload: String) = "$code:$payload"
    private fun str(s: String) = JsonPrimitive(s).toString()

    /** The server's frame order for a buffered place turn (contract §1.4), around [text]. */
    private fun wire(text: String): List<String> {
        val third = (text.length / 3).coerceAtLeast(1)
        val chunks = text.chunked(third)
        return buildList {
            add(frame("8", """[{"kind":"tappy.progress.v1","v":1,"stage":"searching","text":"Đang tìm…"}]"""))
            add(frame("9", """{"toolCallId":"p1","toolName":"search_places","args":{"query":"x"}}"""))
            add(frame("a", """{"toolCallId":"p1","result":{"rows":[{"name":"[CTA_BUTTONS] not text"}]}}"""))
            add(frame("8", """[{"kind":"tappy.future.v9","v":9,"text":"must be ignored"}]"""))
            add(frame("f", """{"messageId":"m1"}"""))
            chunks.forEach { add(frame("0", str(it))) }
            add(frame("e", """{"finishReason":"stop"}"""))
            add(frame("d", """{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}"""))
        }
    }

    private fun replay(lines: List<String>): List<ChatStreamEvent> = lines.mapNotNull { ChatStreamFrames.parse(it) }

    @Test fun `(a) the concatenated 0 text equals the stored message, markers included`() {
        val bad = turns.filter { t -> replay(wire(t.text)).filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta } != t.text }
        assertTrue("text mismatch: ${bad.map { it.name }}", bad.isEmpty())
    }

    @Test fun `(b) no marker is visible, and text AFTER a block still is`() {
        val leaks = mutableListOf<String>()
        val lostTails = mutableListOf<String>()
        for (t in turns) {
            val text = replay(wire(t.text)).filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta }
            val parsed = ChatResponseParser.parse(text)
            val visible = parsed.segments.filterIsInstance<ReplySegment.Text>().joinToString("\n") { markdownVisibleText(it.markdown) }
            if (MARKER.containsMatchIn(visible)) leaks += t.name
            // The ask-after case: prose after the last closed block (askAfter.ts appends it there).
            val lastClose = CLOSE.findAll(t.text).lastOrNull() ?: continue
            val tail = t.text.substring(lastClose.range.last + 1).substringBefore("[").trim()
            val probe = markdownVisibleText(tail).lines().map { it.trim() }.firstOrNull { it.length >= 8 } ?: continue
            if (probe.take(24) !in visible) lostTails += "${t.name}: «${probe.take(40)}»"
        }
        assertTrue("marker visible in: $leaks", leaks.isEmpty())
        assertTrue("text after a block was lost:\n" + lostTails.joinToString("\n"), lostTails.isEmpty())
    }

    @Test fun `(b) a server ask-after appended after CTA and FOLLOWUPS is shown, its chips are chips`() {
        val raw = "Quán A hợp nhất.\n[CTA_BUTTONS]{\"buttons\":[{\"label\":\"Tìm trên GrabFood\",\"type\":\"website\",\"url\":\"https://food.grab.com/vn/vi/restaurants?search=pho\",\"primary\":true}]}[/CTA_BUTTONS]\n" +
            "[FOLLOWUPS]Quán khác?|Gần hơn?[/FOLLOWUPS]\n\nBạn đi mấy người?[FOLLOWUPS]2 người|4 người|Đông hơn[/FOLLOWUPS]"
        val parsed = ChatResponseParser.parse(replay(wire(raw)).filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta })
        val visible = parsed.segments.filterIsInstance<ReplySegment.Text>().joinToString("\n") { markdownVisibleText(it.markdown) }
        assertTrue(visible, "Bạn đi mấy người?" in visible)
        assertTrue(visible, !MARKER.containsMatchIn(visible))
        assertEquals(1, parsed.ctaButtons.size)
        assertTrue(parsed.followups.toString(), parsed.followups.isNotEmpty() && parsed.followups.none { "|" in it || "[" in it })
    }

    @Test fun `the server budget line after the plan block is shown (planBudgetMath, 83853cc)`() {
        val plan = "[TAPPY_PLAN]{\"type\":\"trip\",\"title\":\"Đà Nẵng 3 ngày\",\"people\":2,\"days\":[{\"label\":\"Ngày 1\",\"items\":[{\"time\":\"08:00\",\"emoji\":\"🏖\",\"category\":\"entertainment\",\"name\":\"Biển Mỹ Khê\"}]}]}[/TAPPY_PLAN]"
        val raw = "Kế hoạch đây.\n\n$plan\n\n💰 Ngân sách: 10.000.000đ ÷ 2 người = 5.000.000đ/người\n[FOLLOWUPS]Khách sạn?|Ăn gì?[/FOLLOWUPS]"
        val parsed = ChatResponseParser.parse(replay(wire(raw)).filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta })
        val visible = parsed.segments.filterIsInstance<ReplySegment.Text>().joinToString("\n") { markdownVisibleText(it.markdown) }
        assertNotNull(parsed.plan)
        assertTrue(visible, "💰 Ngân sách: 10.000.000đ ÷ 2 người = 5.000.000đ/người" in visible)
    }

    @Test fun `(c) the LAST places frame is the card, picked first`() {
        fun places(prelim: Boolean, picked: String?) = frame("8", """[{"kind":"tappy.places.v1","v":1,"domain":"food",${if (prelim) "\"preliminary\":true," else ""}${picked?.let { "\"picked\":[\"$it\"]," } ?: ""}"items":[
            {"id":"a","domain":"food","kind":"place","name":"Quán A","rank":1,"actions":[]},
            {"id":"b","domain":"food","kind":"place","name":"Quán B","rank":2,"actions":[]}]}]""".replace("\n", ""))
        val events = replay(listOf(places(true, null), frame("0", str("Chọn Quán B.")), places(false, "b")))
        val last = events.filterIsInstance<ChatStreamEvent.Places>().last().view
        assertTrue(last.preliminary != true)
        assertEquals("b", last.renderOrder().first().id)
    }

    @Test fun `(e) unknown 8 kinds and 9 a f e d frames are ignored without error`() {
        val events = replay(wire("xin chào"))
        assertTrue(events.all { it is ChatStreamEvent.Text || it is ChatStreamEvent.Progress })
        assertEquals(1, events.count { it is ChatStreamEvent.Progress })
    }

    @Test fun `(f) a 3 frame is recognised as the error state`() {
        assertNotNull(ChatStreamFrames.errorFrame("""3:"An error occurred.""""))
        assertNotNull(ChatStreamFrames.errorFrame("""data: 3:"x""""))
        assertNull(ChatStreamFrames.errorFrame("""0:"3: không phải lỗi""""))
        assertNull(ChatStreamFrames.parse("""3:"An error occurred.""""))
    }

    private companion object {
        val MARKER = Regex("""\[/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]""")
        val CLOSE = Regex("""\[/(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]""")
    }
}
