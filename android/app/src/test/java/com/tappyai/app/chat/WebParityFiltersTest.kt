package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.markdownVisibleText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 02/11 (owner: "Android has the same overlapping filters and code wrapped around the model the web had at first"): the client changes a
 * reply only where the web's one-brain client does (web branch f4b07d2, ChatInterface.tsx / ArticleAnswer.tsx). Pinned here:
 *  - a numbered list keeps the model's own numbers (web `<ol start>`; before, every list restarted at 1, so a report's sections 1..5 broken
 *    by paragraphs read 1, 1, 1);
 *  - copy and read-aloud take exactly the text on screen (before: a separate regex turned "C# " into "C" and deleted every "---");
 *  - "🔖 Lưu địa điểm" only when the reply names a place (the web's replyHasSavablePlace; before: under any reply with a bold span);
 *  - the shopping strip and the removed itinerary filter are pinned in RendererPrecedenceTest / PlaceDecisionSectionTest.
 */
class WebParityFiltersTest {

    @Test fun `a numbered list keeps the model's numbers`() {
        assertEquals("1. Doanh số\nMột đoạn.\n2. Giá\n3. Thị phần", markdownVisibleText("1. Doanh số\n\nMột đoạn.\n\n2. Giá\n3. Thị phần"))
        assertEquals("1. a\n2. b", markdownVisibleText("1. a\n2. b"))
    }

    // measured on the emulator 02/11 (T01): "…đang được thu hồi.CNBC" - the web shows the source as its own chip
    @Test fun `a source link right after a word or a full stop is set apart`() {
        assertEquals("đã thu hồi. CNBC", markdownVisibleText("đã thu hồi.[CNBC](https://www.cnbc.com/x)"))
        assertEquals("xem (CNBC)", markdownVisibleText("xem ([CNBC](https://www.cnbc.com/x))"))
        assertEquals("xem CNBC", markdownVisibleText("xem [CNBC](https://www.cnbc.com/x)"))
    }

    // measured on the emulator 02/11: T22 showed "Virta, *The Global Electric Vehicle Market in 2025*" with its asterisks;
    // T31 showed a source whose label was its own address without https, in full
    @Test fun `a link label keeps its emphasis, and a label that is an address reads as the site`() {
        assertEquals("Virta, The Global EV Market", markdownVisibleText("[Virta, *The Global EV Market*](https://www.virta.global/x)"))
        assertEquals("xem apps.apple.com", markdownVisibleText("xem [apps.apple.com/vn/app/adobe/id1?l=vi&platform=ipad](https://apps.apple.com/vn/app/adobe/id1?l=vi&platform=ipad)"))
        assertEquals("xem App Store", markdownVisibleText("xem [App Store](https://apps.apple.com/vn/app/pages/id361309726)"))
    }

    // measured on the emulator 02/11 (T22): "\*São faixas…\*" read "\São faixas…*" in italics
    @Test fun `a backslash escape is the character itself`() {
        assertEquals("*São faixas amplas*, não cotações", markdownVisibleText("\\*São faixas amplas\\*, não cotações"))
        assertEquals("C:\\dir và 2 * 3", markdownVisibleText("C:\\dir và 2 \\* 3"))
    }

    @Test fun `copy and read-aloud take the text as shown`() {
        assertEquals("Học C# trước, rồi Python.\nMột --- hai --- ba", stripMarkdown("Học **C#** trước, rồi Python.\n\nMột --- hai --- ba"))
        assertEquals("Xem Google Maps", stripMarkdown("Xem [Google Maps](https://maps.google.com/x)"))
    }

    @Test fun `the save-place button only when the reply names a place`() {
        assertFalse(replyHasSavablePlace("**Lưu ý:** nên ngủ đủ 8 tiếng.", emptyList(), hasPlaceCards = false))
        assertTrue(replyHasSavablePlace("**Phở Thìn** ⭐ 4.5 – 13 Lò Đúc", emptyList(), hasPlaceCards = false))
        assertTrue(replyHasSavablePlace("**Quán A** – 12 đường Lê Lợi", emptyList(), hasPlaceCards = false))
        assertTrue(replyHasSavablePlace("Không in đậm gì", emptyList(), hasPlaceCards = true))
        assertTrue(replyHasSavablePlace("x", listOf(CtaButton(label = "Bản đồ", type = "maps", url = "https://maps.google.com/x")), hasPlaceCards = false))
        val screen = File("src/main/java/com/tappyai/app/chat/ChatScreen.kt").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(screen.contains("replyHasSavablePlace(message.text, message.ctaButtons, placeCards.isNotEmpty())"))
    }
}
