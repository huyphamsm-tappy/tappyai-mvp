package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.isOpenableLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Owner 01/11 (Android = the web): another AI product's page is never a source - AIHAY (ai-hay.vn and its app), ChatGPT, Perplexity, Gemini, Claude...
 * The server filters every source (src/lib/security/aiSourcePolicy.ts) and the link guard keeps only links a tool returned; the Android client holds
 * the same rule as a second line, so a link that reached it anyway (an old saved reply, a frame) is never shown as one. A port of the web policy and
 * of its cases. Review: the markdown renderer also opens only http(s) links - a model-written [x](intent:...) or (tel:...) used to reach the OS.
 */
class AiSourcePolicyTest {
    @Test fun `the AI products' pages are recognised on the domain or a subdomain, with or without www, scheme-less or wrapped`() {
        for (u in listOf(
            "https://aihay.vn/hoi-dap/quang-trung", "https://www.aihay.vn/x", "https://chat.aihay.vn/c/1", "https://ai-hay.vn/", "https://app.ai-hay.vn/c/2",
            "https://chatgpt.com/share/abc", "https://chat.openai.com/share/abc", "https://www.perplexity.ai/search/x", "https://gemini.google.com/share/x",
            "https://claude.ai/share/x", "https://copilot.microsoft.com/shares/x", "https://poe.com/s/x", "https://grok.com/share/x", "https://chat.deepseek.com/a",
            "https://duck.ai/chat", "https://aistudio.google.com/prompts/x", "https://www.bing.com/chat?q=x", "https://huggingface.co/chat/conversation/x",
            "chatgpt.com/share/x", "aihay.vn/hoi-dap/1", "//ai-hay.vn/x",
            "https://www.google.com/url?q=https://chatgpt.com/share/x&sa=U", "https://www.google.com/url?sa=t&url=https%3A%2F%2Faihay.vn%2Fa",
            "https://r.jina.ai/https://claude.ai/share/x", "https://web.archive.org/web/20261001000000/https://ai-hay.vn/a",
        )) assertTrue(u, AiSourcePolicy.isAiProductSource(u))
    }

    @Test fun `its app's store pages are blocked, an ordinary store page and an article about AI are not`() {
        for (u in listOf(
            "https://play.google.com/store/apps/details?id=vn.aihay.app", "https://play.google.com/store/apps/details?id=vn.ai_hay.app&hl=vi",
            "https://apps.apple.com/vn/app/aihay/id1234567", "https://apps.apple.com/vn/app/ai-hay-tro-ly-ai/id1234567",
            "https://play.google.com/store/apps/details?id=vn.aihay&hl=%E0%A4%A", // a malformed escape does not switch the block off
        )) assertTrue(u, AiSourcePolicy.isAiProductSource(u))
        for (u in listOf("https://play.google.com/store/apps/details?id=com.zing.zalo", "https://apps.apple.com/vn/app/zalo/id579523206", "https://vnexpress.net/ai-hay-nhat-2026-123.html")) assertFalse(u, AiSourcePolicy.isAiProductSource(u))
    }

    @Test fun `ordinary sources, a company's own site, look-alike hosts and non-URLs are not blocked`() {
        for (u in listOf(
            "https://vi.wikipedia.org/wiki/Quang_Trung", "https://openai.com/index/x", "https://www.anthropic.com/news/x", "https://x.ai/news/grok", "https://google.com/search?q=aihay",
            "https://notaihay.vn/x", "https://aihay.vn.evil.example/x", "https://example.com/?u=https://aihay.vn", "https://www.bing.com/search?q=x",
            "https://www.google.com/url?q=https://vnexpress.net/x", "https://huggingface.co/docs/transformers", "javascript:alert(1)", "not a url at all", "",
        )) assertFalse(u, AiSourcePolicy.isAiProductSource(u))
    }

    @Test fun `a link to an AI product's page is only its label, a bare address is gone, every other link is untouched`() {
        val text = "Xem [AIHAY](https://aihay.vn/hoi-dap/1), [Wikipedia](https://vi.wikipedia.org/wiki/A) và https://chatgpt.com/share/x hoặc https://vnexpress.net/b nữa."
        assertEquals("Xem AIHAY, [Wikipedia](https://vi.wikipedia.org/wiki/A) và  hoặc https://vnexpress.net/b nữa.", AiSourcePolicy.stripAiLinks(text))
        val clean = "Không có link nào đáng ngờ, chỉ có [VnExpress](https://vnexpress.net/b)."
        assertEquals(clean, AiSourcePolicy.stripAiLinks(clean))
    }

    @Test fun `the reply parser never shows a link to an AI product`() {
        val parsed = ChatResponseParser.parse("Theo [AIHAY](https://aihay.vn/a) thì khác, còn [Báo](https://vnexpress.net/b) nói vậy.")
        assertFalse(parsed.text.contains("aihay.vn"))
        assertTrue(parsed.text.contains("https://vnexpress.net/b"))
    }

    @Test fun `the markdown renderer opens only http and https links`() {
        assertTrue(isOpenableLink("https://example.com/a"))
        assertTrue(isOpenableLink("http://example.com/a"))
        for (u in listOf("javascript:alert(1)", "intent://x#Intent;scheme=http;end", "tel:+84123456789", "sms:123", "file:///sdcard/x", "content://x/y", "market://details?id=x", "")) assertFalse(u, isOpenableLink(u))
    }
}
