package com.tappyai.app.chat

import com.tappyai.app.chat.data.RealChatRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Planner Stop contract (d9f9f0f), exercised against the REAL
 * [RealChatRepository.parseAssistantReply] — not a re-implementation.
 *
 * WHY THIS SHAPE
 * `ChatViewModel.streamAssistantReply` accumulates raw tokens into `reply`, and on Stop the
 * `catch (CancellationException)` branch feeds `reply.toString()` — the RAW buffer, markers and
 * all — to `parseAssistantReply`, copies `plan` onto the message, sets `rawText = reply`, and
 * persists under `NonCancellable`. `persistConversation` stores `rawText ?: text`, and
 * `restoreMessage` feeds that stored content back through the SAME `parseAssistantReply`.
 *
 * So every link after the cancellation is a pure function of the accumulated buffer, and each
 * buffer state below is exactly what exists at the instant Stop is pressed:
 *
 *   A natural completion      prose + plan + CTA + followups
 *   B Stop before the block   prose only
 *   C Stop after the block    prose + COMPLETE plan + CTA      <- the bug contract
 *   D Stop inside the block   prose + opening marker + partial JSON, no closing tag
 *
 * The one link NOT covered here is the coroutine cancellation itself (that the catch branch runs
 * at all), because `ChatViewModel` builds a `TextToSpeech(context)` in its init and so cannot be
 * constructed on the JVM without adding Robolectric/MockK. That link is proven on-device instead.
 */
class PlannerStopCancelParseTest {

    // ── the real repository, with the two trivial provider interfaces faked ──────────────────
    //
    // The Context is a framework MockContext and is never touched: RealChatRepository
    // dereferences it ONLY in toDto()'s image encoding (contentResolver, lines ~243-244), which
    // parseAssistantReply does not reach. Passing null is impossible — Kotlin emits
    // Intrinsics.checkNotNullParameter for the non-null constructor parameter — hence MockContext
    // plus `unitTests.isReturnDefaultValues` rather than a mocking library.
    private val repo = RealChatRepository(
        okHttpClient = OkHttpClient(),
        baseUrl = "http://localhost/",
        json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true },
        logger = object : LoggerProvider {
            override fun d(tag: String, message: String) = Unit
            override fun i(tag: String, message: String) = Unit
            override fun w(tag: String, message: String, throwable: Throwable?) = Unit
            override fun e(tag: String, message: String, throwable: Throwable?) = Unit
        },
        stringProvider = object : StringProvider {
            override fun get(resId: Int): String = "s"
            override fun get(resId: Int, vararg args: Any): String = "s"
        },
        // ContextWrapper is a concrete android.content class taking a nullable base, so it needs
        // no mocking library; android.test.mock.MockContext would require useLibrary().
        context = android.content.ContextWrapper(null),
    )

    private val prose = "Mình đã lên kế hoạch 3 ngày cho bạn!"

    private val planJson = """
        {"type":"trip","title":"Đà Nẵng 3N2Đ","people":2,"budget_total":"5.000.000đ",
         "days":[{"label":"Ngày 1","items":[
           {"time":"14:00","emoji":"🏨","category":"hotel","name":"San San Hotel",
            "price":"600.000đ","address":"Đà Nẵng","maps_link":"https://maps.example",
            "booking_link":"https://book.example","place_id":"p1","photo_url":"https://img.example"}
         ]}],
         "cost_breakdown":{"Khách sạn":"1.8tr"},"share_text":"share me"}
    """.trimIndent()

    private val ctaJson =
        """{"buttons":[{"label":"Book Hotel","type":"external","url":"https://book.example","primary":true}]}"""

    /** The buffer at the instant Stop is pressed, once the closing [/TAPPY_PLAN] has arrived. */
    private val bufferStopAfterPlan =
        "$prose\n[TAPPY_PLAN]$planJson[/TAPPY_PLAN]\n[CTA_BUTTONS]$ctaJson[/CTA_BUTTONS]"

    // ── C: the bug contract ────────────────────────────────────────────────────────────────

    @Test
    fun `C - Stop after a complete plan block preserves the plan`() {
        val parsed = repo.parseAssistantReply(bufferStopAfterPlan)

        assertNotNull("plan must survive a Stop once the block has fully arrived", parsed.plan)
        assertEquals("Đà Nẵng 3N2Đ", parsed.plan!!.title)
        assertEquals(2, parsed.plan!!.people)
        assertTrue("the plan must carry its days, else the card renders empty", parsed.plan!!.days.isNotEmpty())
        assertEquals("San San Hotel", parsed.plan!!.days.single().items.single().name)
    }

    @Test
    fun `C - the CTA block that arrived before Stop is parsed too`() {
        val parsed = repo.parseAssistantReply(bufferStopAfterPlan)
        assertEquals(1, parsed.ctaButtons.size)
        assertEquals("Book Hotel", parsed.ctaButtons.single().label)
    }

    @Test
    fun `C - no raw marker and no raw JSON leaks into the visible text`() {
        val text = repo.parseAssistantReply(bufferStopAfterPlan).text

        assertFalse(text.contains("[TAPPY_PLAN]", ignoreCase = true))
        assertFalse(text.contains("[/TAPPY_PLAN]", ignoreCase = true))
        assertFalse(text.contains("[CTA_BUTTONS]", ignoreCase = true))
        assertFalse("raw plan JSON must never reach the bubble", text.contains("\"days\""))
        assertFalse(text.contains("budget_total"))
        assertFalse(text.contains("booking_link"))
        assertEquals("the prose that arrived before the block is kept verbatim", prose, text)
    }

    // ── persistence + restore: both are pure functions of the same buffer ────────────────────

    @Test
    fun `C - what persistConversation stores round-trips back into a plan on restore`() {
        // persistConversation() stores `rawText ?: text`, and the cancel branch sets
        // rawText = reply.toString() — i.e. exactly this buffer. restoreMessage() then feeds the
        // stored content back through this same parse.
        val storedContent = bufferStopAfterPlan
        val restored = repo.parseAssistantReply(storedContent)

        assertNotNull("a restored conversation must rebuild the plan card", restored.plan)
        assertEquals("Đà Nẵng 3N2Đ", restored.plan!!.title)
        assertEquals(
            "restore must be identical to the in-memory parse, or History shows a different plan",
            repo.parseAssistantReply(bufferStopAfterPlan).plan!!.days.size,
            restored.plan!!.days.size,
        )
        assertFalse(restored.text.contains("[TAPPY_PLAN]", ignoreCase = true))
    }

    @Test
    fun `C - storing the display text instead of the raw buffer would lose the plan`() {
        // Guards the reason persistConversation stores rawText: the stripped display text has no
        // markers left, so persisting it cannot round-trip. If someone "simplifies" that to
        // `content = it.text`, this fails.
        val displayText = repo.parseAssistantReply(bufferStopAfterPlan).text
        assertNull(
            "display text must NOT round-trip to a plan — that is why rawText is persisted",
            repo.parseAssistantReply(displayText).plan,
        )
    }

    // ── A / B / D: the other transitions must stay well-behaved ─────────────────────────────

    @Test
    fun `A - natural completion parses plan, CTA and followups`() {
        val full = "$bufferStopAfterPlan\n[FOLLOWUPS]Thêm spa?|Gần biển?"
        val parsed = repo.parseAssistantReply(full)

        assertNotNull(parsed.plan)
        assertEquals(1, parsed.ctaButtons.size)
        assertEquals(listOf("Thêm spa?", "Gần biển?"), parsed.followups)
        assertFalse(parsed.text.contains("[FOLLOWUPS]", ignoreCase = true))
    }

    @Test
    fun `B - Stop before the plan block keeps the prose and yields no plan`() {
        val parsed = repo.parseAssistantReply(prose)
        assertNull(parsed.plan)
        assertEquals(prose, parsed.text)
    }

    @Test
    fun `D - Stop inside an incomplete plan block yields no plan and leaks nothing`() {
        // No closing tag: every block regex requires one, so the opening marker plus half a JSON
        // object would otherwise sit in the bubble.
        val halfArrived = "$prose\n[TAPPY_PLAN]${planJson.take(120)}"
        val parsed = repo.parseAssistantReply(halfArrived)

        assertNull("a half-arrived block must degrade to plain text, not a broken card", parsed.plan)
        assertFalse(parsed.text.contains("[TAPPY_PLAN]", ignoreCase = true))
        assertFalse(parsed.text.contains("\"days\""))
        assertFalse(parsed.text.contains("budget_total"))
        assertEquals(prose, parsed.text)
    }

    @Test
    fun `D - a malformed plan payload degrades to text rather than an empty card`() {
        val malformed = "$prose\n[TAPPY_PLAN]{\"type\":\"trip\",\"days\":[]}[/TAPPY_PLAN]"
        val parsed = repo.parseAssistantReply(malformed)
        assertNull("a block with no days is a parse failure (web parity)", parsed.plan)
        assertFalse(parsed.text.contains("[TAPPY_PLAN]", ignoreCase = true))
    }

    // ── the streaming bubble must never show the block while it is arriving ─────────────────

    @Test
    fun `the streaming bubble hides the plan block right up to the moment Stop is pressed`() {
        assertEquals(prose, streamingDisplayText(bufferStopAfterPlan))
        assertEquals(prose, streamingDisplayText("$prose\n[TAPPY_PLAN]${planJson.take(80)}"))
    }
}
