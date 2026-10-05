package com.tappyai.app.chat.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A reply stream that ends WITHOUT its finish frame is a CUT reply — web `src/lib/chat/streamCut.ts` (56a26ae, A1 owner
 * UAT 2026-10-02): "the chat route always ends a data stream with a `d:` (finish) frame — or a `3:` error frame". A body
 * that closes cleanly before either was shown as a normal half message; web now says so and offers «Answer again».
 *
 * Evidence for the rule is the real wire: every `/api/chat` capture the web session recorded on UAT
 * (`consult-raw/`, `consult-raw-s10/`) ends with exactly one `d:` frame. Those captures are replayed here through the
 * production [ChatStreamEnd]; cutting each one before its `d:` line is the web test's "closes without finish" case.
 */
class ChatStreamCutTest {

    private fun captures(): List<File> {
        val cl = javaClass.classLoader!!
        return listOf("consult-raw", "consult-raw-s10").flatMap { dir ->
            File(cl.getResource(dir)!!.toURI()).listFiles { f -> f.name.endsWith(".raw.txt") }!!.sortedBy { it.name }.toList()
        }
    }

    private fun endOf(lines: List<String>): ChatStreamEnd = ChatStreamEnd().also { e -> lines.forEach(e::feed) }

    @Test
    fun `every real captured stream ends with a finish frame, so none is a cut`() {
        val files = captures()
        assertTrue("there are captures to replay", files.size >= 20)
        for (f in files) {
            val lines = f.readText().split('\n')
            assertEquals("${f.name}: exactly one d: frame on the real wire", 1, lines.count { it.startsWith("d:") })
            assertFalse("${f.name} is a complete reply", endOf(lines).cut)
        }
    }

    @Test
    fun `the same streams cut before their finish frame are reported as cut`() {
        for (f in captures()) {
            val lines = f.readText().split('\n')
            val before = lines.takeWhile { !it.startsWith("d:") }.filter { it.isNotEmpty() }
            assertTrue("${f.name}: there is something before d:", before.isNotEmpty())
            assertTrue("${f.name} cut before d: is a cut reply", endOf(before).cut)
        }
    }

    @Test
    fun `an error frame ends a stream too, an empty body is not a cut`() {
        assertFalse(endOf(listOf("0:\"Xin \"", "3:\"An error occurred.\"")).cut)
        assertFalse("a body with no line at all is not reported (web: sawAny)", endOf(emptyList()).cut)
        assertTrue(endOf(listOf("0:\"Xin \"", "0:\"chào\"")).cut)
    }

    @Test
    fun `only d and 3 frames count as the end - not e, f, 8 or a text that merely starts with d`() {
        assertFalse(ChatStreamFrames.isEndFrame("e:{\"finishReason\":\"stop\"}"))
        assertFalse(ChatStreamFrames.isEndFrame("8:[{\"kind\":\"tappy.progress.v1\"}]"))
        assertFalse(ChatStreamFrames.isEndFrame("0:\"d:\""))
        assertTrue(ChatStreamFrames.isEndFrame("d:{\"finishReason\":\"stop\"}"))
        assertTrue(ChatStreamFrames.isEndFrame("3:\"boom\""))
        assertTrue("an SSE wrapper is stripped like for every other frame", ChatStreamFrames.isEndFrame("data: d:{}"))
    }

    // ── wiring: a correct rule wired to nothing is still the old bug ──

    private fun src(rel: String): String {
        var dir: File? = File(System.getProperty("user.dir")!!).absoluteFile
        while (dir != null && !File(dir, "app/src/main").exists()) dir = dir.parentFile
        return File(dir!!, "app/src/main/$rel").readText()
    }

    @Test
    fun `the repository sends Cut last, the ViewModel keeps the half answer and clears the flag with the next turn, the screen offers answering again`() {
        val repo = src("java/com/tappyai/app/chat/data/RealChatRepository.kt")
        assertTrue(repo.contains("end.feed(line)") && repo.contains("if (end.cut) trySend(ChatStreamEvent.Cut)"))
        assertTrue("the cut notice is sent after the loop, before the flow closes", repo.indexOf("if (end.cut)") > repo.indexOf("while (!source.exhausted())"))

        val vm = src("java/com/tappyai/app/chat/ChatViewModel.kt")
        assertTrue(vm.contains("ChatStreamEvent.Cut -> { _streamCut.value = true; return@collect }"))
        assertTrue("a new turn clears the notice", vm.contains("_streamCut.value = false"))

        val screen = src("java/com/tappyai/app/chat/ChatScreen.kt")
        assertTrue(screen.contains("if (streamCut && !isResponding)") && screen.contains("onClick = viewModel::onRegenerate"))
    }

    @Test
    fun `the notice words are the web ones in both languages`() {
        val vi = src("res/values-vi/strings_chat.xml")
        val en = src("res/values/strings_chat.xml")
        // src/lib/i18n/w5/chatResilience.ts @ 56a26ae
        assertTrue(vi.contains("<string name=\"chat_stream_cut\">Câu trả lời bị ngắt giữa chừng. Bạn thử lại nhé?</string>"))
        assertTrue(vi.contains("<string name=\"chat_stream_cut_retry\">Trả lời lại</string>"))
        assertTrue(en.contains("<string name=\"chat_stream_cut\">The answer was cut off half-way. Try again?</string>"))
        assertTrue(en.contains("<string name=\"chat_stream_cut_retry\">Answer again</string>"))
    }
}
