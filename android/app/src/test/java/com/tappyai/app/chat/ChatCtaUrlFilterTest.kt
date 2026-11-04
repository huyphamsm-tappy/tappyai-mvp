package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Web `parseCTA` drops every CTA button whose url is not a link to http(s), a `tel:` / `mailto:` link or a same-site path
 * (`src/lib/structuredContent/parseCta.ts` @ 56a26ae, security review 02/10): "never javascript:/data:/other schemes", and no
 * whitespace or control character in the url. Android opened the url of any button with ACTION_VIEW, so a `javascript:`,
 * `intent:` or `file:` url inside a `[CTA_BUTTONS]` block reached `startActivity`. The same rule now runs in the parser.
 */
class ChatCtaUrlFilterTest {

    @Test
    fun `http(s), tel, mailto and same-site paths are kept, whatever the case of the scheme`() {
        for (u in listOf(
            "https://www.tappyai.com/x?y=1", "http://example.com", "HTTPS://EXAMPLE.COM", "tel:+84901234567", "TEL:0901234567",
            "mailto:support@tappyai.com", "/booking?name=Qu%C3%A1n", "/", "  https://example.com/a  ",
        )) assertTrue("$u is a safe CTA url", isSafeCtaUrl(u))
    }

    @Test
    fun `other schemes, protocol-relative and backslash paths, blanks and embedded whitespace or control characters are refused`() {
        for (u in listOf(
            "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html;base64,AAAA", "intent://scan/#Intent;scheme=zxing;end", "file:///sdcard/a",
            "content://x/y", "sms:0901", "geo:10,106", "market://details?id=a", "//evil.example.com/a", "/\\evil.example.com", "",
            "   ", "https://exa mple.com", "https://example.com/\nx", "https://example.com/\u0000", "https://example.com/\u007f", "www.example.com", "zalo.me/123",
        )) assertFalse("${u.replace("\n", "\\n")} is refused", isSafeCtaUrl(u))
    }

    @Test
    fun `a CTA block keeps its safe buttons and loses the unsafe ones, in order`() {
        val block = """{"buttons":[
            {"label":"Bản đồ","type":"maps","url":"https://maps.google.com/?q=a","primary":true},
            {"label":"Xấu","type":"website","url":"javascript:alert(1)"},
            {"label":"Gọi","type":"call","url":"tel:0901234567"},
            {"label":"Lậu","type":"website","url":"//evil.example.com"},
            {"label":"Đặt","type":"internal_booking","url":"/booking?name=Quan"}]}"""
        val parsed = ChatResponseParser.parse("Mình gợi ý quán này.\n\n[CTA_BUTTONS]${block.replace("\n", "")}[/CTA_BUTTONS]")
        assertEquals(listOf("Bản đồ", "Gọi", "Đặt"), parsed.ctaButtons.map { it.label })
        assertFalse("no raw marker left in the text", parsed.text.contains("CTA_BUTTONS") || parsed.text.contains("javascript"))
    }

    @Test
    fun `a block whose every button is unsafe yields no buttons and still no raw JSON`() {
        val parsed = ChatResponseParser.parse("Xong.\n\n[CTA_BUTTONS]{\"buttons\":[{\"label\":\"x\",\"type\":\"website\",\"url\":\"data:text/html,hi\"}]}[/CTA_BUTTONS]")
        assertTrue(parsed.ctaButtons.isEmpty())
        assertFalse(parsed.text.contains("{") || parsed.text.contains("buttons"))
    }
}
