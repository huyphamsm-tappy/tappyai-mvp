package com.tappyai.app.chat.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A3 (02/11): the one-brain stream's frames, read and re-checked as the web client reads them (web branch, frozen at f4b07d2):
 *  - `8:` tappy.research.v1 (readResearchStatus), tappy.research_charts.v1 (readResearchCharts), tappy.doc_media.v1 (sanitizeDocMedia),
 *    tappy.turn_status.v1 - every element of the array, not only the first;
 *  - `9:` / `a:` the tool call and its result (the web's "🌐 Đang tìm trên web…" hint).
 * A malformed frame is dropped, never a crash or something shown.
 */
class ChatStreamOneBrainFramesTest {

    private fun one(line: String) = ChatStreamFrames.events(line)

    @Test fun `the research card - phases, steps, https links only, latest values`() {
        val ev = one("""8:[{"type":"tappy.research.v1","title":"Xe điện","phase":"done","steps":[{"title":"Doanh số","status":"done"},{"title":"Giá","status":"failed"},{"title":"x","status":"weird"}],"sources":12,"links":[{"id":1,"title":"A","url":"https://a.example/x"},{"id":2,"title":"js","url":"javascript:alert(1)"},{"id":3,"title":"plain","url":"http://b.example/"}]}]""")
        val r = (ev.single() as ChatStreamEvent.Research).status
        assertEquals("done", r.phase)
        assertEquals(listOf("Doanh số" to "done", "Giá" to "failed"), r.steps.map { it.title to it.status })
        assertEquals(12, r.sources)
        assertEquals(listOf(ResearchLink(1, "A", "https://a.example/x")), r.links)
    }

    @Test fun `a research frame with an unknown phase, or no phase, is dropped`() {
        assertTrue(one("""8:[{"type":"tappy.research.v1","title":"T","phase":"thinking","steps":[],"sources":0}]""").isEmpty())
        assertTrue(one("""8:[{"type":"tappy.research.v1","title":"T","steps":[],"sources":0}]""").isEmpty())
    }

    @Test fun `charts - at least two finite points, bar unless line, at most 4 charts and 12 points`() {
        val pts = (1..15).joinToString(",") { """{"label":"L$it","value":$it,"source":1}""" }
        val charts = (1..6).joinToString(",") { """{"section":"S$it","title":"T$it","unit":"xe","kind":"${if (it == 2) "line" else "pie"}","points":[$pts]}""" }
        val bad = """{"section":"S","title":"T","unit":"","kind":"bar","points":[{"label":"a","value":1,"source":1}]}"""
        val ev = one("""8:[{"type":"tappy.research_charts.v1","charts":[$bad,$charts]}]""")
        val c = (ev.single() as ChatStreamEvent.Charts).charts
        assertEquals(4, c.size)
        assertEquals(listOf("bar", "line", "bar", "bar"), c.map { it.kind })
        assertEquals(12, c[0].points.size)
        assertEquals("S1", c[0].section)
    }

    @Test fun `section pictures - safe https only, a title, at most 8, source web unless wikipedia`() {
        val items = (1..10).joinToString(",") { """{"title":"Mục $it","src":"https://img.example/$it.jpg","source":"${if (it == 1) "wikipedia" else "x"}"}""" }
        val ev = one("""8:[{"kind":"tappy.doc_media.v1","v":1,"items":[{"title":"","src":"https://img.example/0.jpg"},{"title":"http","src":"http://img.example/h.jpg"},{"title":"local","src":"https://localhost/a.jpg"},$items]}]""")
        val m = (ev.single() as ChatStreamEvent.DocMedia).items
        assertEquals(8, m.size)
        assertEquals("Mục 1", m[0].title)
        assertEquals("wikipedia", m[0].source)
        assertEquals("web", m[1].source)
        assertTrue(one("""8:[{"kind":"tappy.doc_media.v1","v":2,"items":[{"title":"a","src":"https://img.example/a.jpg"}]}]""").isEmpty())
    }

    @Test fun `the turn status - incomplete or interrupted, nothing else`() {
        assertEquals(ChatStreamEvent.TurnStatus("interrupted"), one("""8:[{"kind":"tappy.turn_status.v1","v":1,"status":"interrupted","reason":"x"}]""").single())
        assertEquals(ChatStreamEvent.TurnStatus("incomplete"), one("""8:[{"kind":"tappy.turn_status.v1","v":1,"status":"incomplete"}]""").single())
        assertTrue(one("""8:[{"kind":"tappy.turn_status.v1","v":1,"status":"ok"}]""").isEmpty())
    }

    @Test fun `every element of one annotation frame is read, in order`() {
        val ev = one("""8:[{"kind":"tappy.progress.v1","v":1,"stage":"found","text":"Đã có 5 nguồn"},{"type":"tappy.research.v1","title":"T","phase":"writing","steps":[],"sources":5},{"kind":"unknown"}]""")
        assertEquals(2, ev.size)
        assertTrue(ev[0] is ChatStreamEvent.Progress)
        assertTrue(ev[1] is ChatStreamEvent.Research)
    }

    @Test fun `the tool call and its result`() {
        assertEquals(ChatStreamEvent.ToolCall("call_1", "web_search"), one("""9:{"toolCallId":"call_1","toolName":"web_search","args":{"query":"giá vàng"}}""").single())
        assertEquals(ChatStreamEvent.ToolResult("call_1"), one("""a:{"toolCallId":"call_1","result":{"rows":[]}}""").single())
        assertTrue(one("""9:{"toolName":"web_search"}""").isEmpty())
        assertTrue(one("""9:not json""").isEmpty())
    }

    @Test fun `parse keeps answering the first event of a line (the older callers)`() {
        assertEquals(ChatStreamEvent.Text("Xin chào"), ChatStreamFrames.parse("0:\"Xin chào\""))
        assertNull(ChatStreamFrames.parse("e:{\"finishReason\":\"stop\"}"))
    }

    @Test fun `the repository reads every event of a line, and the ViewModel keeps them on the reply`() {
        fun src(p: String) = File("src/main/java/com/tappyai/app/chat/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(src("data/RealChatRepository.kt").contains("ChatStreamFrames.events(line).forEach { trySend(it) }"))
        val vm = src("ChatViewModel.kt")
        for (k in listOf("Research", "Charts", "DocMedia", "TurnStatus", "ToolCall", "ToolResult")) assertTrue(k, vm.contains("is ChatStreamEvent.$k ->"))
        val msg = src("ChatMessage.kt")
        for (f in listOf("val research: ResearchStatus?", "val charts: List<ResearchChart>", "val docMedia: List<DocMediaItem>", "val turnStatus: String?")) assertTrue(f, msg.contains(f))
    }
}
