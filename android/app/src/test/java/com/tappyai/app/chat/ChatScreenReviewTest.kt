package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Review 02/11 (Android): small display faults. Each was red before its fix. */
class ChatScreenReviewTest {
    private fun src(p: String) = File("src/main/java/com/tappyai/app/chat/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()

    // Two branches of one chain have the same rank and name; the pager refuses a repeated key and the screen crashes.
    @Test fun `place pages with the same rank and name still get distinct keys, and keep them stable`() {
        assertEquals(listOf("1:Cà phê", "1:Cà phê#2", "2:Trà", "1:Cà phê#3"), pageKeys(listOf("1:Cà phê", "1:Cà phê", "2:Trà", "1:Cà phê")))
        assertEquals(listOf("a", "b"), pageKeys(listOf("a", "b")))
        assertTrue(src("PlaceCard.kt").contains("pageKeys("))
    }

    // The CTA buttons check the scheme; the offer rows and place actions opened the server's address verbatim with ACTION_VIEW.
    @Test fun `offer and place links open only as http or https`() {
        assertTrue(src("ShoppingDecisionCard.kt").contains("isOpenableLink(offer.url)"))
        assertTrue(src("PlaceCard.kt").contains("isOpenableLink(action.url)"))
        assertTrue(src("PlaceCard.kt").contains("isOpenableLink(url)"))
    }

    // Saving a report swallowed every failure (the system's save dialog had already created an empty file) and said nothing on success: after
    // a long PDF the person saw nothing and pressed again. Each of the three buttons saves through one helper that says how it went and
    // removes the empty file when it failed.
    @Test fun `saving a report says how it went and leaves no empty file`() {
        val card = src("ResearchCard.kt")
        assertEquals(3, Regex("""saveReport\(context, scope, target""").findAll(card).count())
        assertTrue(card.contains("DocumentsContract.deleteDocument"))
        fun res(p: String) = File("src/main/res/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        for (file in listOf("values/strings_chat.xml", "values-vi/strings_chat.xml")) {
            val xml = res(file)
            assertTrue(file, "name=\"chat_research_saved\"" in xml)
            assertTrue(file, "name=\"chat_research_save_failed\"" in xml)
        }
    }

    // The "stream cut" card is the last item when the stream ended cut; the scroll to the end did not count it, so a long last reply left
    // the card (and its "answer again") below the screen.
    @Test fun `the scroll to the end counts the stream-cut card`() {
        val screen = src("ChatScreen.kt")
        assertTrue(screen.contains("LaunchedEffect(messages.size, isResponding, streamCut)"))
        assertTrue(screen.contains("if (streamCut && !isResponding) 1 else 0"))
    }
}
