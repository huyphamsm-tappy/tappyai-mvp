import XCTest
@testable import TappyAI

/// Owner 01/11: another AI product's page is never a source. These mirror the cases of web `aiSourcePolicy.test.ts`
/// (and Android `AiSourcePolicyTest`); the iOS chat read such a link as an ordinary one and opened it.
final class AiSourcePolicyTests: XCTestCase {
    func testAnAiProductsAnswerAndChatPagesAreBlockedOnTheDomainAndEverySubdomain() {
        let urls = [
            "https://aihay.vn/hoi-dap/quang-trung", "https://www.aihay.vn/x", "https://chat.aihay.vn/c/1", "https://aihay.net/a", "https://aihay.com/a",
            "https://chatgpt.com/share/abc", "https://chat.openai.com/share/abc", "https://www.perplexity.ai/search/x", "https://gemini.google.com/share/x",
            "https://claude.ai/share/x", "https://copilot.microsoft.com/shares/x", "https://poe.com/s/x", "https://grok.com/share/x", "https://chat.deepseek.com/a",
            "https://you.com/search?q=x", "https://www.phind.com/search?q=x", "https://meta.ai/p/x", "https://character.ai/chat/x", "https://chat.mistral.ai/chat",
            "https://kimi.com/chat/x", "https://chat.qwen.ai/c/x", "https://duck.ai/chat", "https://aistudio.google.com/prompts/x",
        ]
        for u in urls { XCTAssertTrue(AiSourcePolicy.isAiProductSource(u), u) }
    }

    func testOrdinarySourcesACompanysOwnSiteAndLookAlikeHostsAreNotBlocked() {
        let urls = [
            "https://vi.wikipedia.org/wiki/Quang_Trung", "https://vnexpress.net/x", "https://openai.com/index/x", "https://www.anthropic.com/news/x",
            "https://google.com/search?q=x", "https://notaihay.vn/x", "https://aihay.vn.evil.example/x", "https://example.com/?u=https://aihay.vn",
            "javascript:alert(1)", "not a url", "",
        ]
        for u in urls { XCTAssertFalse(AiSourcePolicy.isAiProductSource(u), u) }
    }

    func testAihayAtAiHayVnAndItsAppStorePagesAreBlockedButOtherStorePagesAreNot() {
        for u in ["https://ai-hay.vn/", "https://www.ai-hay.vn/hoi-dap/1", "https://app.ai-hay.vn/c/2",
                  "https://play.google.com/store/apps/details?id=vn.aihay.app", "https://play.google.com/store/apps/details?id=vn.ai_hay.app&hl=vi",
                  "https://apps.apple.com/vn/app/aihay/id1234567", "https://apps.apple.com/vn/app/ai-hay-tro-ly-ai/id1234567"] {
            XCTAssertTrue(AiSourcePolicy.isAiProductSource(u), u)
        }
        for u in ["https://play.google.com/store/apps/details?id=com.zing.zalo", "https://apps.apple.com/vn/app/zalo/id579523206",
                  "https://vnexpress.net/ai-hay-nhat-2026-123.html"] {
            XCTAssertFalse(AiSourcePolicy.isAiProductSource(u), u)
        }
    }

    func testASchemeLessProtocolRelativeAndDisplayedAddressIsReadAsWhatItSays() {
        for u in ["chatgpt.com/share/x", "aihay.vn/hoi-dap/1", "//ai-hay.vn/x", "www.perplexity.ai/search/q", "aihay.vn › hoi-dap › 1"] {
            XCTAssertTrue(AiSourcePolicy.isAiProductSource(u), u)
        }
        XCTAssertFalse(AiSourcePolicy.isAiProductSource("vnexpress.net/the-gioi"))
        XCTAssertFalse(AiSourcePolicy.isAiProductSource("not a url at all"))
    }

    func testARedirectorAnArchiveAndAReaderAroundAnAiPageAreUnwrapped() {
        for u in [
            "https://www.google.com/url?q=https://chatgpt.com/share/x&sa=U", "https://www.google.com/url?sa=t&url=https%3A%2F%2Faihay.vn%2Fa",
            "https://r.jina.ai/https://claude.ai/share/x", "https://web.archive.org/web/20261001000000/https://ai-hay.vn/a",
            "https://webcache.googleusercontent.com/search?q=cache:https://perplexity.ai/x",
        ] {
            XCTAssertTrue(AiSourcePolicy.isAiProductSource(u), u)
        }
        for u in [
            "https://www.google.com/url?q=https://vnexpress.net/x", "https://web.archive.org/web/2026/https://vnexpress.net/",
            "https://www.google.com/search?q=aihay", "https://example.com/?u=https://aihay.vn",
        ] {
            XCTAssertFalse(AiSourcePolicy.isAiProductSource(u), u)
        }
    }

    func testBingAndHuggingFaceAreBlockedOnTheirChatPathOnly() {
        for u in ["https://www.bing.com/chat?q=x", "https://huggingface.co/chat/conversation/x"] {
            XCTAssertTrue(AiSourcePolicy.isAiProductSource(u), u)
        }
        for u in ["https://www.bing.com/search?q=x", "https://huggingface.co/docs/transformers", "https://x.ai/news/grok"] {
            XCTAssertFalse(AiSourcePolicy.isAiProductSource(u), u)
        }
    }

    func testAMalformedPercentEscapeDoesNotSwitchTheStoreBlockOff() {
        XCTAssertTrue(AiSourcePolicy.isAiProductSource("https://play.google.com/store/apps/details?id=vn.aihay&hl=%E0%A4%A"))
    }

    // MARK: - stripAiLinks

    func testALinkToAnAiProductKeepsItsLabelAndLosesTheLink() {
        let text = "Xem [AIHAY](https://aihay.vn/hoi-dap/1) và [Wiki](https://vi.wikipedia.org/wiki/Quang_Trung) nhé."
        XCTAssertEqual(AiSourcePolicy.stripAiLinks(text), "Xem AIHAY và [Wiki](https://vi.wikipedia.org/wiki/Quang_Trung) nhé.")
    }

    func testABareAddressOfAnAiProductIsRemovedAndAnotherOneStays() {
        let text = "Nguồn: https://chatgpt.com/share/abc và https://vnexpress.net/x"
        XCTAssertEqual(AiSourcePolicy.stripAiLinks(text), "Nguồn:  và https://vnexpress.net/x")
    }

    func testAnAddressWithBracketsIsOneLinkSoNoStrayBracketIsLeftBehind() {
        XCTAssertEqual(AiSourcePolicy.stripAiLinks("xem [Foo](https://claude.ai/Foo_(bar)) rồi"), "xem Foo rồi")
        let keep = "xem [Foo](https://x.org/Foo_(bar)) rồi"
        XCTAssertEqual(AiSourcePolicy.stripAiLinks(keep), keep)
    }

    func testAnImageFromAnAiProductIsRemovedWithoutALeftoverBang() {
        XCTAssertEqual(AiSourcePolicy.stripAiLinks("a ![ảnh](https://chatgpt.com/x.png) b"), "a  b")
    }

    func testATextWithoutLinksIsReturnedAsItWas() {
        XCTAssertEqual(AiSourcePolicy.stripAiLinks("Xin chào, hôm nay trời đẹp."), "Xin chào, hôm nay trời đẹp.")
    }

    // MARK: - Where the chat reads a reply

    func testTheParserDropsALinkToAnAiProductFromTheReplyText() {
        let parsed = ContentParser.parse("Tham khảo [AIHAY](https://ai-hay.vn/a) và [VnExpress](https://vnexpress.net/b).")
        XCTAssertFalse(parsed.text.contains("ai-hay.vn"))
        XCTAssertTrue(parsed.text.contains("AIHAY"), "the label stays")
        XCTAssertTrue(parsed.text.contains("https://vnexpress.net/b"))
    }

    func testTheParserDoesNotDrawAnImageThatComesFromAnAiProduct() {
        let parsed = ContentParser.parse("Ảnh:\n\n![a](https://chatgpt.com/x.png)\n\n![b](https://cdn.example/b.png)")
        XCTAssertEqual(parsed.images.map(\.url), ["https://cdn.example/b.png"])
        XCTAssertFalse(parsed.text.contains("chatgpt.com"))
    }
}
