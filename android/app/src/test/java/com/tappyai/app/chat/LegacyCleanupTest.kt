package com.tappyai.app.chat

import com.tappyai.app.chat.data.compactHistory
import com.tappyai.core.designsystem.component.TappyChatRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A7 (02/11): the old five-domain consultative leaves the chat (owner: Tappy is a general assistant like ChatGPT; one brain on the server).
 *  - the welcome and the reply avatar are the general Tappy's, whatever shortcut opened the chat (web: one welcome);
 *  - no follow-up chips invented by the app per domain: only the server's own (web has no client fallback);
 *  - the request history is compacted like the web's (src/lib/chat/requestHistory.ts): an earlier user turn's photo is not sent again
 *    (a note says one was attached), an earlier reply goes as its prose, the last reply as it arrived (its markers carry the turn's state);
 *  - the live text is re-read at most every 50 ms or at a line break, not on every token (a long report slowed down quadratically).
 */
class LegacyCleanupTest {

    private fun src(p: String) = File("src/main/java/com/tappyai/app/chat/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()

    @Test fun `the welcome and the avatar are the general Tappy's`() {
        val screen = src("ChatScreen.kt")
        assertFalse(screen.contains("viewModel.category.mascot"))
        assertFalse(screen.contains("category = viewModel.category,"))
    }

    @Test fun `no follow-up chips invented by the app`() {
        assertFalse(src("ChatViewModel.kt").contains("getFollowups("))
        assertFalse(src("data/ChatRepository.kt").contains("fun getFollowups"))
    }

    @Test fun `the history - earlier photos are not sent again, earlier replies go as prose, the last reply as it arrived`() {
        // a plain JVM test has no android.net.Uri: which turns carry a photo is given by the predicate the repository defaults to imageUri != null
        val withPhoto = setOf(1L, 3L)
        val msgs = listOf(
            ChatMessage(1, TappyChatRole.User, "Ảnh này là gì?"),
            ChatMessage(2, TappyChatRole.Assistant, "Đó là phở.", raw = "Đó là phở. [FOLLOWUPS]a|b[/FOLLOWUPS]"),
            ChatMessage(3, TappyChatRole.User, "Còn ảnh này?"),
            ChatMessage(4, TappyChatRole.Assistant, "Bún chả.", raw = "Bún chả. [TAPPY_ASK]{}[/TAPPY_ASK]"),
            ChatMessage(5, TappyChatRole.User, "Ở đâu ngon?"),
        )
        val out = compactHistory(msgs) { it.id in withPhoto }
        assertTrue(out[0].text, out[0].text == "Ảnh này là gì?\n[Attached with this message: photo]")
        assertEquals("", out[1].raw)
        assertTrue("an earlier photo turn says so too", out[2].text.endsWith("[Attached with this message: photo]"))
        assertEquals("Bún chả. [TAPPY_ASK]{}[/TAPPY_ASK]", out[3].raw)
        assertEquals(msgs[4], out[4])
        // the last user turn keeps its photo (and no note)
        assertEquals(msgs[2], compactHistory(msgs.take(3)) { it.id in withPhoto }[2])
    }

    @Test fun `the live text is re-read at most every 50 ms or at a line break`() {
        assertTrue(reparseDue(lastAtMs = 0, nowMs = 50, delta = "x"))
        assertFalse(reparseDue(lastAtMs = 0, nowMs = 49, delta = "x"))
        assertTrue(reparseDue(lastAtMs = 0, nowMs = 1, delta = "a\nb"))
        assertTrue(src("ChatViewModel.kt").contains("if (reparseDue(lastParseAt, now, token))"))
        assertTrue(src("data/RealChatRepository.kt").contains("compactHistory(messages.filterNot { it.isError })"))
    }
}
