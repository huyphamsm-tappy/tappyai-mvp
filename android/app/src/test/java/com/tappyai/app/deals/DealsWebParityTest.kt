package com.tappyai.app.deals

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity 2026-09-28 (L16), against the web DealsView:
 *  - the page is "Deal hôm nay" / "Khám phá ưu đãi từ các sàn thương mại điện tử";
 *  - the "Hỏi Tappy trước khi mua" card leads the page whether or not deals loaded — on UAT the
 *    feed is empty and the web still shows the card above "Chưa có ưu đãi nào. Quay lại sau nhé!";
 *  - its CTA opens Chat EMPTY: "no prompt is pre-filled — with no deal in hand there is no subject
 *    to carry" (DealsView.tsx). Android pre-filled and auto-sent a shopping question.
 */
class DealsWebParityTest {

    private val screen = File("src/main/java/com/tappyai/app/deals/DealsScreen.kt").readText()
    private val shell = File("src/main/java/com/tappyai/app/home/HomeShellScreen.kt").readText()

    private fun vi(): Map<String, String> = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""")
        .findAll(File("src/main/res/values-vi/strings_deals.xml").readText()).associate { it.groupValues[1] to it.groupValues[2] }

    @Test
    fun `title and subtitle are the web's`() {
        assertEquals("Deal hôm nay", vi()["deals_v3_title"])
        assertEquals("Khám phá ưu đãi từ các sàn thương mại điện tử", vi()["deals_v3_subtitle"])
        assertEquals("Chưa có ưu đãi nào. Quay lại sau nhé!", vi()["deals_empty_title"])
        assertTrue("the tab's app bar shows the page title", shell.contains("if (currentTab == HomeTab.Deals) stringResource(R.string.deals_v3_title)"))
    }

    @Test
    fun `the ask-Tappy card is drawn in the empty state too and opens an empty chat`() {
        val empty = screen.substring(screen.indexOf("is UiState.Empty ->"), screen.indexOf("is UiState.Success ->"))
        assertTrue("card above the empty state", empty.contains("AskTappyHero("))
        assertTrue(screen.contains("onAsk = onOpenChat"))
        assertFalse("no pre-filled general question any more", screen.contains("deals_ask_general_prefill"))
        assertTrue("the shell wires the empty chat", shell.contains("onOpenChat = { navController.navigateToChat() }"))
    }
}
