package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChatStreamEvent
import com.tappyai.app.chat.data.ChatStreamFrames
import com.tappyai.core.designsystem.component.markdownVisibleText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Consult V2 — the FINAL output format (ANDROID-REQUESTS §2, 29/09 "AI tư vấn bản cuối"), replayed
 * OFFLINE from the raw `/api/chat` streams the web session captured on UAT with the Android request
 * shape (test resources `consult-raw/`, no AI call). Each stream goes line by line through the
 * production [ChatStreamFrames] and [ChatResponseParser], and what a reader sees is asserted:
 *  - HỎI: `[TAPPY_ASK]` becomes 2–3 question groups of 2–4 chips (with `x-tappy-caps: ask`), or
 *    readable "• Câu? (A / B)" lines + the first question's chips (without caps); no JSON either way.
 *  - CHỐT: "Mình chọn: <tên>" leads, ≤ 2 alternatives, the server-counted "còn N lựa chọn" line, and
 *    exactly the server's chips "Xem thêm | Lên kế hoạch chi tiết"; card #1 = the chosen place.
 *  - KẾ HOẠCH: a complete `[TAPPY_PLAN]` card; the fixed bold headings read as plain headings.
 *  - `tappy.turn.v1` and every other unknown `8:` kind are ignored; `9:`/`a:`/`f:`/`e:`/`d:` too.
 */
class ConsultV2RawReplayTest {

    private data class Replay(val name: String, val text: String, val events: List<ChatStreamEvent>)

    private val streams: List<Replay> by lazy {
        val dir = File(javaClass.classLoader!!.getResource("consult-raw")!!.toURI())
        dir.listFiles { f -> f.name.endsWith(".raw.txt") }!!.sortedBy { it.name }.map { f ->
            val events = f.readText().split('\n').mapNotNull { ChatStreamFrames.parse(it) }
            Replay(f.name, events.filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta }, events)
        }
    }

    private fun visible(text: String): String {
        val p = ChatResponseParser.parse(text)
        return p.segments.filterIsInstance<ReplySegment.Text>().joinToString("\n") { markdownVisibleText(it.markdown) }
    }

    private fun named(part: String) = streams.single { part in it.name }

    @Test fun `every capture replays - text arrives, nothing raw reaches the reader`() {
        assertEquals(15, streams.size)
        for (s in streams) {
            assertTrue(s.name, s.text.isNotBlank())
            val v = visible(s.text)
            assertFalse("${s.name}: marker or JSON visible\n$v", Regex("""\[/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]|\{"[a-z_]+":""").containsMatchIn(v))
            assertFalse("${s.name}: ** visible", v.lines().any { "**" in it })
            assertFalse("${s.name}: raw URL visible", Regex("""https?://\S+""").containsMatchIn(v))
        }
    }

    @Test fun `HOI with x-tappy-caps - question groups of chips, the reply text keeps only the lead and tail`() {
        for (s in listOf(named("r10-caps-ask"), named("R11-t1"))) {
            val p = ChatResponseParser.parse(s.text)
            assertTrue(s.name, p.ask.size in 2..3)
            assertTrue(s.name, p.ask.all { it.options.size in 2..4 && it.q.isNotBlank() })
            assertTrue(s.name, visible(s.text).contains("Bạn chọn nhanh bên dưới"))
        }
        // The answer the "Gửi" button sends: the chosen options in question order.
        val qs = ChatResponseParser.parse(named("r10-caps-ask").text).ask
        assertEquals("${qs[0].options[0]} · ${qs[1].options[1]}", AskBlock.composeAnswer(qs, mapOf(qs[0].id to qs[0].options[0], qs[1].id to qs[1].options[1])))
    }

    @Test fun `HOI without caps (older builds) - one readable line per question plus the first question's chips`() {
        val s = named("r10-no-caps")
        val p = ChatResponseParser.parse(s.text)
        assertTrue(p.ask.isEmpty())
        val v = visible(s.text)
        assertTrue(v, v.lines().count { it.startsWith("• ") } >= 2)
        assertEquals(listOf("Chưa biết", "Nhạc trẻ / pop", "Rap / hip-hop"), p.followups)
    }

    @Test fun `CHOT - the pick leads, then at most 2 others, the server count line and its two chips`() {
        val picks = streams.filter { "Mình chọn" in it.text }
        assertEquals(6, picks.size)
        for (s in picks) {
            val p = ChatResponseParser.parse(s.text)
            val v = visible(s.text)
            assertTrue(s.name, Regex("""Mình chọn:\s*\S""").containsMatchIn(v))
            assertEquals(s.name, listOf("Xem thêm", "Lên kế hoạch chi tiết"), p.followups)
            val alternatives = v.lines().count { it.startsWith("• ") }
            assertTrue("${s.name}: $alternatives alternatives", alternatives <= 2)
            // Card #1 = the server's pick: the LAST places frame, `picked` first (Android's part). When the
            // server sends `picked`, card #1 is that place and it is the one the text names. When it does
            // not (r15 runs 1/3/4/5: the text picks a hotel the card does not even hold), that is the
            // server's R17 — the client cannot invent the match.
            val places = s.events.filterIsInstance<ChatStreamEvent.Places>().lastOrNull()?.view
            if (places != null && places.picked.isNotEmpty()) {
                val first = places.renderOrder().first()
                assertEquals(s.name, places.picked.first(), first.id)
                val chosen = Regex("""Mình chọn:\s*([^—\n]+)""").find(v)!!.groupValues[1].trim().trimEnd('.', ',')
                assertTrue("${s.name}: card #1 «${first.name}» vs chosen «$chosen»", first.name.contains(chosen.take(12)) || chosen.contains(first.name.take(12)))
            }
        }
    }

    @Test fun `KE HOACH - every plan turn yields a complete plan card, headings read clean`() {
        val plans = streams.filter { "[TAPPY_PLAN]" in it.text }
        assertEquals(4, plans.size)
        for (s in plans) {
            val p = ChatResponseParser.parse(s.text)
            val plan = p.plan
            assertNotNull(s.name, plan)
            assertTrue(s.name, plan!!.title.isNotBlank() && plan.days.isNotEmpty() && plan.days.all { d -> d.items.isNotEmpty() })
            assertNotNull("${s.name}: the share payload survives", p.planJson)
        }
    }

    @Test fun `tappy turn v1 and other unknown 8 kinds are ignored, a places frame still decodes`() {
        val s = named("r15-run1-t1")
        assertTrue(File(javaClass.classLoader!!.getResource("consult-raw/${s.name}")!!.toURI()).readText().contains("tappy.turn.v1"))
        assertTrue(s.events.all { it is ChatStreamEvent.Text || it is ChatStreamEvent.Places || it is ChatStreamEvent.Progress })
        assertTrue(s.events.any { it is ChatStreamEvent.Places })
        assertNull(ChatStreamFrames.parse("""8:[{"kind":"tappy.turn.v1","domain":"travel","turnType":"pick","usd":0.01}]"""))
    }
}
