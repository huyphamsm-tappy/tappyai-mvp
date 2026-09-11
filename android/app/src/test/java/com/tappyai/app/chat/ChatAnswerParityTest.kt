package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * WEB ↔ ANDROID INFORMATION PARITY for the AI answer.
 *
 * The rule these hold: for one server response, a phone user must end up with the same FACTS and
 * the same WAYS TO ACT ON THEM as a browser user. Not the same pixels — the same information.
 *
 * Two losses this suite was created for, both client-side, both invisible to every existing test
 * because every existing test starts from a parsed model rather than from what the reader can
 * actually see and tap:
 *
 *   1. A BARE URL WAS DEAD TEXT. `formatMessage` on web runs two link passes — markdown links, then
 *      any remaining `https?://…`. Android had only the first. A news or web-search answer that
 *      cites its source as a plain URL, which the model does whenever nothing hands it a label,
 *      rendered as untappable grey text: the claim was on screen and the way to check it was not.
 *
 *   2. THE PRICE-WATCH ACTION WAS WEB-ONLY. The web shopping card offers to track the price of the
 *      product it just recommended. On the phone the same card ended at the offer rows, so the user
 *      had to already know the feature existed, leave the answer, and retype the product name.
 *
 * The rendering itself lives in `:core:designsystem` and in Compose, neither of which this project
 * has a test harness for — no core module declares test dependencies. So, exactly as
 * `ChatErrorMessageContractTest` does with the error classifier, the RULE is tested directly and
 * the WIRING is pinned against source: a correct rule wired to nothing is still the old bug.
 */
class ChatAnswerParityTest {

    private fun source(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, rel)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        fail("$rel not found above ${File(".").absolutePath}")
        error("unreachable")
    }

    // ── 1. Bare URLs ────────────────────────────────────────────────────────

    /** Mirrors `bareUrlAt` in TappyMarkdown.kt. */
    private fun bareUrlAt(text: String, start: Int): String? {
        val scheme = when {
            text.startsWith("https://", start, ignoreCase = true) -> 8
            text.startsWith("http://", start, ignoreCase = true) -> 7
            else -> return null
        }
        var end = start + scheme
        while (end < text.length && !text[end].isWhitespace() && text[end] != '<' && text[end] != ')') end++
        if (end <= start + scheme) return null
        while (end > start + scheme && text[end - 1] in ".,;:!?") end--
        return text.substring(start, end)
    }

    @Test
    fun `a bare source URL is recognised, so the reader can reach it`() {
        val prose = "Theo VnExpress, giá vé đã tăng. Nguồn: https://vnexpress.net/gia-ve-may-bay-tang-123.html"
        val at = prose.indexOf("https://")
        assertEquals("https://vnexpress.net/gia-ve-may-bay-tang-123.html", bareUrlAt(prose, at))
    }

    @Test
    fun `sentence punctuation ends the sentence, not the address`() {
        // Web keeps the trailing dot inside the href and links to a URL that 404s. Same link here,
        // one fewer dead end — and the character still renders, as text.
        assertEquals("https://tuoitre.vn/abc", bareUrlAt("Xem https://tuoitre.vn/abc.", 4))
        assertEquals("https://tuoitre.vn/abc", bareUrlAt("Xem https://tuoitre.vn/abc, rồi", 4))
        assertEquals("https://tuoitre.vn/abc", bareUrlAt("Xem https://tuoitre.vn/abc?", 4))
    }

    @Test
    fun `a query string is part of the address and survives`() {
        assertEquals(
            "https://shopee.vn/search?keyword=tai+nghe&sortBy=price",
            bareUrlAt("Mua tại https://shopee.vn/search?keyword=tai+nghe&sortBy=price hôm nay", 8),
        )
    }

    @Test
    fun `a closing paren ends the address, so a parenthesised link is not swallowed`() {
        assertEquals("https://vnexpress.net/x", bareUrlAt("(nguồn: https://vnexpress.net/x) và", 8))
    }

    @Test
    fun `text that is not an address is left alone`() {
        assertNull(bareUrlAt("https://", 0))
        assertNull(bareUrlAt("httpsomething", 0))
        assertNull(bareUrlAt("ftp://files.example/x", 0))
    }

    @Test
    fun `the renderer actually linkifies bare URLs, not only markdown ones`() {
        val md = source("android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMarkdown.kt")
        assertTrue(
            "TappyMarkdown must detect a bare http(s) run",
            md.contains("bareUrlAt(text, i)"),
        )
        assertTrue(
            "and turn it into a real clickable link, like the markdown pass does",
            md.substringAfter("bareUrlAt(text, i)").contains("LinkAnnotation.Url"),
        )
    }

    // ── 2. The price-watch action ───────────────────────────────────────────

    /** Mirrors the card's rule: the action belongs to the product the server recommended. */
    private fun watchName(view: ShoppingDecisionView): String? =
        view.entities.firstOrNull { it.recommended }?.config?.takeIf { it.isNotBlank() }

    private fun entity(config: String, recommended: Boolean) =
        ShoppingEntityView(key = config, config = config, recommended = recommended)

    @Test
    fun `the watch is offered for the recommended product, not for an alternative`() {
        val view = ShoppingDecisionView(
            entities = listOf(entity("Air M1 8GB", false), entity("Air M2 16GB", true)),
        )
        assertEquals("Air M2 16GB", watchName(view))
    }

    @Test
    fun `no recommendation means no watch button — never a watch on a product nobody suggested`() {
        val view = ShoppingDecisionView(entities = listOf(entity("Air M1 8GB", false)))
        assertNull(watchName(view))
        assertNull(watchName(ShoppingDecisionView(entities = listOf(entity("   ", true)))))
    }

    @Test
    fun `the card exposes the action and the screen wires it to the composer`() {
        val card = source("android/app/src/main/java/com/tappyai/app/chat/ShoppingDecisionCard.kt")
        assertTrue("the card must offer the action", card.contains("onPriceWatch: ((String) -> Unit)?"))
        assertTrue("guarded on the recommended product", card.contains("recommended?.config?.takeIf"))

        val screen = source("android/app/src/main/java/com/tappyai/app/chat/ChatScreen.kt")
        assertTrue(
            "pressing it must PREFILL the composer, so the user still sends the request and it goes "
                + "through the shipped save_price_watch tool rather than a second write path",
            screen.contains("viewModel.onInputChange(pricePrefill + name)"),
        )
    }

    @Test
    fun `the card and the composer chip ask in exactly the same words`() {
        // Two entry points phrasing one request differently is two requests as far as the model is
        // concerned. Both read the same string resource.
        val screen = source("android/app/src/main/java/com/tappyai/app/chat/ChatScreen.kt")
        assertTrue(screen.contains("val pricePrefill = stringResource(R.string.chat_chip_price_watch_prefill)"))
        assertTrue(screen.contains("R.string.chat_chip_price_watch, ChipPriceColors, stringResource(R.string.chat_chip_price_watch_prefill)"))
    }

    @Test
    fun `the price-watch label exists in both languages`() {
        for (path in listOf(
            "android/app/src/main/res/values/strings_chat.xml",
            "android/app/src/main/res/values-vi/strings_chat.xml",
        )) {
            assertTrue(path, source(path).contains("name=\"shopping_decision_price_watch\""))
        }
    }
}
