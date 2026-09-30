package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChatStreamEvent
import com.tappyai.app.chat.data.ChatStreamFrames
import com.tappyai.app.chat.plan.NO_PRICE
import com.tappyai.app.chat.plan.PlanArea
import com.tappyai.app.chat.plan.planCardViewOf
import com.tappyai.core.designsystem.component.markdownVisibleText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * "AI tư vấn ổn định" (web `b01b53c`, ANDROID-REQUESTS §2 30/09): the §10 real UAT run's raw answers,
 * replayed OFFLINE through the production [ChatStreamFrames] + [ChatResponseParser] (resources
 * `consult-raw-s10/`, from `gs://tappyai-uat-evidence/evidence/s10-2026-09-30/scenarios-55e298e/raw/`;
 * `a:` payloads trimmed and photo `token=` values redacted, every other frame byte-for-byte).
 *  - the plan turns (t7) of travel ×2, entertainment, food; the flight answer (TRAVEL-3 t2) whose links
 *    now read "Xem giá trên <hãng>" and go through Tappy's `/go/at` (option C);
 *  - nothing raw reaches the reader; travel plans draw the v2 card from today's fields (placeholders,
 *    no v2 field yet — the web's note); a non-travel plan turn has no [TAPPY_PLAN] block today.
 */
class ConsultS10RawReplayTest {

    private data class Replay(val name: String, val text: String)

    private val streams: List<Replay> by lazy {
        val dir = File(javaClass.classLoader!!.getResource("consult-raw-s10")!!.toURI())
        dir.listFiles { f -> f.name.endsWith(".raw.txt") }!!.sortedBy { it.name }.map { f ->
            val events = f.readText().split('\n').mapNotNull { ChatStreamFrames.parse(it) }
            Replay(f.name, events.filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta })
        }
    }

    private fun named(part: String) = streams.single { it.name.startsWith(part) }
    private fun visible(text: String) = ChatResponseParser.parse(text).segments
        .filterIsInstance<ReplySegment.Text>().joinToString("\n") { markdownVisibleText(it.markdown) }

    @Test fun `every s10 answer replays with nothing raw visible`() {
        assertEquals(5, streams.size)
        for (s in streams) {
            assertTrue(s.name, s.text.isNotBlank())
            val v = visible(s.text)
            assertFalse("${s.name}: marker visible\n$v", Regex("""\[/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]|\{"[a-z_]+":""").containsMatchIn(v))
            assertFalse("${s.name}: ** visible", v.lines().any { "**" in it })
            assertFalse("${s.name}: raw URL visible", Regex("""https?://\S+""").containsMatchIn(v))
        }
    }

    @Test fun `travel plan turns - complete plan, v2 card draws from today's fields with placeholders`() {
        for (id in listOf("TRAVEL-1-t7", "TRAVEL-2-t7")) {
            val p = ChatResponseParser.parse(named(id).text)
            val plan = p.plan
            assertNotNull(id, plan)
            assertNotNull("$id: the share payload survives", p.planJson)
            val card = planCardViewOf(plan!!)
            assertEquals(PlanArea.TRAVEL, card.area)
            assertNull("no v2 hero yet (web: model not asked to write v2 fields)", card.heroKey)
            assertTrue(id, card.days.isNotEmpty() && card.days.all { it.stops.isNotEmpty() })
            assertTrue(id, card.days.flatMap { it.stops }.all { it.imageKey == null })
            assertTrue(id, card.days.flatMap { it.stops }.all { it.priced || it.price == NO_PRICE })
        }
    }

    @Test fun `non-travel plan turns answer in headings - no plan block today`() {
        for (id in listOf("ENT-1-t7", "FOOD-1-t7")) {
            val p = ChatResponseParser.parse(named(id).text)
            assertNull(id, p.plan)
            assertTrue(id, visible(named(id).text).contains("chưa có giá — hỏi quán"))
        }
    }

    @Test fun `flight - Xem gia tren hang links through Tappy's go-at, label shown as written, the two chips`() {
        val s = named("TRAVEL-3-t2")
        val p = ChatResponseParser.parse(s.text)
        val v = visible(s.text)
        assertTrue(v, v.contains("Xem giá trên Traveloka") && v.contains("Xem giá trên Trip.com"))
        val links = Regex("""\]\((https://[^)\s]+)\)""").findAll(s.text).map { it.groupValues[1] }.toList()
        assertEquals(2, links.size)
        assertTrue(links.all { it.startsWith("https://uat.tappyai.com/go/at?") })
        assertEquals(listOf("Xem thêm", "Lên kế hoạch chi tiết"), p.followups)
    }
}
