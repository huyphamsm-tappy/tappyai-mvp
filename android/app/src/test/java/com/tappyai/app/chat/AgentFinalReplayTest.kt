package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChatErrorDto
import com.tappyai.app.chat.data.ChatException
import com.tappyai.app.chat.data.ChatStreamEnd
import com.tappyai.app.chat.data.ChatStreamEvent
import com.tappyai.app.chat.data.ChatStreamFrames
import com.tappyai.app.chat.data.chatErrorFor
import com.tappyai.core.common.StringProvider
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The Web FINAL Agent's REAL streams (Web `a43948d`, TAPPY_AGENT=1 — see `consult-agent-final/README.md`), replayed OFFLINE through the
 * production [ChatStreamFrames], [ChatStreamEnd] and [ChatResponseParser]. The handoff's contract for clients is "the Agent writes the
 * same AI SDK data-stream protocol"; these are the bytes that prove it for Android: every turn ends with `d:` (never a cut), the Agent's
 * own frames (`9:` `a:` `e:` `8:tappy.turn.v1`) are ignored, progress and place frames decode, a trip plan parses into a card, and a
 * flight answer carries tracked links in the text, not a raw marker.
 */
class AgentFinalReplayTest {

    private class Run(val name: String, val lines: List<String>) {
        val events = lines.mapNotNull { ChatStreamFrames.parse(it) }
        val text = events.filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta }
        val end = ChatStreamEnd().also { e -> lines.filter { it.isNotEmpty() }.forEach(e::feed) }
        val parsed = ChatResponseParser.parse(text)
    }

    private val dir = File(javaClass.classLoader!!.getResource("consult-agent-final")!!.toURI())
    private fun run(name: String) = Run(name, File(dir, "$name.raw.txt").readText().split('\n'))
    private val all by lazy { listOf("A_general", "B_local_discovery", "C_follow_up_carried", "D_trip_plan", "E_flight").map(::run) }

    @Test
    fun `every real Agent turn ends with its finish frame - none is a cut - and Agent-only frames are ignored`() {
        for (r in all) {
            assertEquals("${r.name}: one d: frame", 1, r.lines.count { it.startsWith("d:") })
            assertFalse("${r.name} is a complete reply", r.end.cut)
            for (l in r.lines.filter { it.startsWith("9:") || it.startsWith("a:") || it.startsWith("e:") || it.startsWith("d:") }) assertNull("${r.name}: $l", ChatStreamFrames.parse(l))
            val turn = r.lines.single { it.startsWith("8:") && "tappy.turn.v1" in it }
            assertNull("${r.name}: tappy.turn.v1 is not for the screen", ChatStreamFrames.parse(turn))
            assertTrue("${r.name}: there is an answer", r.text.isNotBlank())
            assertFalse("${r.name}: no raw marker reaches the reader", r.parsed.text.contains("[TAPPY_") || r.parsed.text.contains("[CTA_BUTTONS]") || r.parsed.text.contains("[FOLLOWUPS]"))
        }
    }

    @Test
    fun `a no-tool turn is plain text - one text part, no card, no progress`() {
        val r = run("A_general")
        assertTrue(r.events.all { it is ChatStreamEvent.Text })
        assertNull(r.parsed.plan)
        assertTrue(r.parsed.places.isEmpty() && r.parsed.ctaButtons.isEmpty() && r.parsed.ask.isEmpty())
    }

    @Test
    fun `a place turn streams progress then a preliminary set then the decision, in that order`() {
        val r = run("B_local_discovery")
        val stages = r.events.filterIsInstance<ChatStreamEvent.Progress>().map { it.stage }
        assertEquals(listOf("searching", "found", "finishing"), stages)
        val places = r.events.filterIsInstance<ChatStreamEvent.Places>().map { it.view }
        assertEquals("the preliminary set, then the decision", 2, places.size)
        assertTrue(places[0].preliminary && places[0].picked.isEmpty())
        val decision = places[1]
        assertFalse(decision.preliminary)
        assertEquals(3, decision.picked.size)
        assertEquals(3, decision.shown)
        assertTrue(decision.items.size >= 3 && decision.items.all { it.id.isNotBlank() && it.name.isNotBlank() })
        assertTrue("the decision is ranked and the picked ids exist in the items", decision.positionsRanked() && decision.picked.all { id -> decision.items.any { it.id == id } })
        assertEquals("the render order starts with the model's picks", decision.picked, decision.renderOrder().take(3).map { it.id })
        // The order of events is the order on the wire: text only after the decision's progress.
        val firstText = r.events.indexOfFirst { it is ChatStreamEvent.Text }
        assertTrue(r.events.indexOfFirst { it is ChatStreamEvent.Progress && it.stage == "finishing" } < firstText)
    }

    @Test
    fun `a follow-up answered from the carried card is only text`() {
        val r = run("C_follow_up_carried")
        assertTrue(r.events.all { it is ChatStreamEvent.Text })
        assertTrue(r.text.contains("mở"))
    }

    @Test
    fun `a trip plan arrives as one complete TAPPY_PLAN block and parses into the card`() {
        val r = run("D_trip_plan")
        val plan = r.parsed.plan!!
        assertEquals("trip", plan.type)
        assertEquals(3, plan.days.size)
        assertTrue(plan.days.all { d -> d.items.isNotEmpty() && d.items.all { it.name.isNotBlank() && it.time.isNotBlank() } })
        // This real turn had no sourced price, so Web wrote the literal "chưa có giá" for every cost line and for budget_total (honest
        // unverified-data handling, handoff §1.13). Android drops that sentinel (PlanPrice.kt) instead of drawing it as a price.
        assertTrue("Web sent sentinel-only cost lines", """"cost_breakdown":{"Khách sạn":"chưa có giá"""" in r.text)
        assertTrue("no sentinel survives as a price", plan.costBreakdown.orEmpty().values.none { it.contains("chưa có giá") } && plan.budgetTotal?.contains("chưa có giá") != true)
        assertEquals("local tips: one about a stop, one general", 2, plan.localTips!!.size)
        assertTrue(r.parsed.text.contains("Lịch này ưu tiên"))
        assertFalse("the plan JSON does not stay in the text", r.parsed.text.contains("\"days\""))
        assertTrue("the places frame of the plan turn decodes too", r.events.any { it is ChatStreamEvent.Places })
    }

    @Test
    fun `a flight answer says unverified and carries tracked links as text, not as a CTA marker`() {
        val r = run("E_flight")
        assertTrue(r.text.contains("chưa xác minh"))
        assertTrue(r.parsed.ctaButtons.isEmpty())
        val links = Regex("""\]\((https://www\.tappyai\.com/go/at\?[^)]+)\)""").findAll(r.text).map { it.groupValues[1] }.toList()
        assertEquals("one Trip.com and one Traveloka link", 2, links.size)
        assertTrue(links.all { isSafeCtaUrl(it) })
        assertTrue(r.parsed.text.contains("Xem giá trên Trip.com") && r.parsed.text.contains("Xem giá trên Traveloka"))
    }

    @Test
    fun `the real 429 of the free tier is a daily cap with the server sentence - 10 questions a day`() {
        val strings = object : StringProvider {
            override fun get(resId: Int): String = "res$resId"
            override fun get(resId: Int, vararg args: Any): String = "res$resId"
        }
        val dto = Json { ignoreUnknownKeys = true }.decodeFromString<ChatErrorDto>(File(dir, "limit-429.json").readText())
        val e = chatErrorFor(429, dto, strings)
        assertTrue(e is ChatException.DailyLimitReached)
        assertTrue(e.message!!.contains("10 câu hỏi AI hôm nay"))
    }
}
