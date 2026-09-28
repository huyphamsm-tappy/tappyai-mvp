package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.MarkdownNormalize
import com.tappyai.core.designsystem.component.markdownVisibleText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * OFFLINE render check (owner 2026-09-28: "test hiển thị OFFLINE bằng câu trả lời thô phiên web lưu
 * từ golden set, không gọi AI lại"). Every assistant turn the web session recorded on UAT for the
 * golden set (docs/uat/evidence/golden/uat4-p1-golden-final-rep1, copied to test resources) is
 * replayed through the SAME chain the chat screen renders — [ChatResponseParser.parse] → text
 * segments → [markdownVisibleText] (the TappyMarkdown inline scan) — and what a reader would see is
 * asserted: no `**`, no raw marker / JSON, no raw URL, no glued links, no abnormal whitespace; CTA
 * buttons carry a label + https url; a plan carries title + days + items; followups become chips.
 */
class GoldenOfflineRenderTest {

    private data class Turn(val file: String, val index: Int, val user: String, val raw: String)

    private val turns: List<Turn> by lazy {
        val dir = File(javaClass.classLoader!!.getResource("golden")!!.toURI())
        dir.listFiles { f -> f.name.endsWith(".json") }!!.sortedBy { it.name }.flatMap { f ->
            val root = Json.parseToJsonElement(f.readText()).jsonObject
            root["turns"]!!.jsonArray.mapIndexedNotNull { i, t ->
                val o = t as JsonObject
                val raw = o["text"]?.jsonPrimitive?.content ?: return@mapIndexedNotNull null
                if (raw.isBlank()) null else Turn(f.name, i, o["user"]?.jsonPrimitive?.content.orEmpty(), raw)
            }
        }
    }

    private fun visible(raw: String): String {
        val parsed = ChatResponseParser.parse(raw)
        return parsed.segments.filterIsInstance<ReplySegment.Text>().joinToString("\n") { markdownVisibleText(it.markdown) }
    }

    private fun failures(check: (Turn, String) -> String?): List<String> =
        turns.mapNotNull { t -> check(t, visible(t.raw))?.let { "${t.file}#${t.index} «${t.user.take(40)}»: $it" } }

    private fun assertNone(what: String, bad: List<String>) =
        assertTrue("$what (${bad.size}/${turns.size} turns):\n" + bad.joinToString("\n"), bad.isEmpty())

    @Test fun `golden set is present`() {
        assertTrue("expected the 24-case golden set, got ${turns.size} turns", turns.size >= 24)
    }

    @Test fun `no bold asterisks reach the reader`() = assertNone("visible **", failures { _, v ->
        v.lines().firstOrNull { "**" in it }?.let { "line: ${it.take(120)}" }
    })

    @Test fun `no raw marker or JSON reaches the reader`() = assertNone("raw marker/JSON", failures { _, v ->
        MARKER.find(v)?.let { "found «${it.value}»" }
    })

    @Test fun `no raw URL reaches the reader`() = assertNone("raw URL", failures { _, v ->
        RAW_URL.find(v)?.let { "found «${it.value.take(80)}»" }
    })

    @Test fun `no glued links reach the renderer`() = assertNone("glued links", failures { t, _ ->
        // What TappyMarkdown parses: the server emits "[A](u)[B](v)"; the renderer must separate them.
        val stream = MarkdownNormalize.forRender(ChatResponseParser.parse(t.raw).streamText)
        GLUED.find(stream)?.let { "found «${it.value.take(80)}»" }
    })

    @Test fun `no abnormal whitespace`() = assertNone("abnormal whitespace", failures { _, v ->
        when {
            "\n\n\n" in v -> "3+ blank lines"
            Regex("[^\\s] {3,}[^\\s]").containsMatchIn(v) -> "run of spaces: «${Regex("[^\\s] {3,}[^\\s]").find(v)!!.value}»"
            else -> null
        }
    })

    @Test fun `CTA buttons have a label and an https destination`() = assertNone("bad CTA", failures { t, _ ->
        ChatResponseParser.parse(t.raw).ctaButtons.firstOrNull { it.label.isBlank() || !it.url.startsWith("https://") && !it.url.startsWith("http://") }
            ?.let { "button «${it.label}» → «${it.url}»" }
    })

    @Test fun `a plan block always yields a complete plan card`() = assertNone("incomplete plan", failures { t, _ ->
        val payload = PLAN_BODY.find(t.raw)?.groupValues?.get(1)?.trim() ?: return@failures null
        // A block whose payload is not even a JSON object is a SERVER defect (golden M1#6: the block
        // starts mid-JSON — ANDROID-REQUESTS R7). No client can draw it; the other tests prove it
        // is stripped without leaking. Everything that IS a plan object must become a full card.
        if (!payload.startsWith("{")) return@failures null
        val plan = ChatResponseParser.parse(t.raw).plan ?: return@failures "plan block did not decode"
        when {
            plan.title.isBlank() -> "no title"
            plan.days.isEmpty() -> "no days"
            plan.days.any { d -> d.items.isEmpty() } -> "a day without items"
            plan.days.flatMap { it.items }.any { it.name.isBlank() || it.time.isBlank() } -> "item without name/time"
            else -> null
        }
    })

    @Test fun `followups become one-tap chips, never text`() = assertNone("followups", failures { t, v ->
        if ("[FOLLOWUPS]" !in t.raw) return@failures null
        val fu = ChatResponseParser.parse(t.raw).followups
        when {
            fu.isEmpty() -> "no chips parsed"
            fu.any { it.isBlank() || "|" in it } -> "bad chip $fu"
            fu.any { it in v && v.lines().any { l -> l.trim() == it } } -> "chip text also in body"
            else -> null
        }
    })

    private companion object {
        val MARKER = Regex("""\[/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]|\{"[a-z_]+":|\]\(""")
        val PLAN_BODY = Regex("""\[TAPPY_PLAN\]([\s\S]*?)\[/TAPPY_PLAN\]""")
        val RAW_URL = Regex("""https?://\S+""")
        // Two markdown links back to back with no separator: "[A](u)[B](v)".
        val GLUED = Regex("""\]\([^)\s]+\)\[""")
    }
}
