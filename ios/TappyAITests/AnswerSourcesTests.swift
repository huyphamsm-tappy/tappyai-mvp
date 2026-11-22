import XCTest
@testable import TappyAI

/// The "Nguồn · N" chip under an answer: pages the text links to (web `answerSources`, `ArticleAnswer.tsx`).
final class AnswerSourcesTests: XCTestCase {

    func testOneEntryPerPageNotPerSite() {
        let text = "A [Báo một](https://vnexpress.net/a-1.html) B [Báo hai](https://vnexpress.net/b-2.html) C [Báo ba](https://tuoitre.vn/c)"
        let s = AnswerSources.of(text)
        XCTAssertEqual(s.count, 3, "three articles of one newspaper are three sources, not one")
        XCTAssertEqual(s.map(\.host), ["vnexpress.net", "vnexpress.net", "tuoitre.vn"])
        XCTAssertEqual(s.map(\.label), ["Báo một", "Báo hai", "Báo ba"])
    }

    func testTheSamePageTwiceCountsOnce() {
        let text = "[A](https://www.example.com/p/) và [B](https://example.com/p) và [C](https://example.com/p?x=1)"
        XCTAssertEqual(AnswerSources.of(text).count, 2, "www and a trailing slash are the same page; a different query is another page")
    }

    func testOnlySafeHttpsLinksCount() {
        let text = "[http](http://example.com/a) [js](javascript:alert(1)) [cred](https://apple.com@evil.example/x) [local](https://127.0.0.1/x) [ok](https://example.org/ok)"
        XCTAssertEqual(AnswerSources.of(text).map(\.host), ["example.org"])
    }

    func testAPageOfAnotherAIProductIsNeverASource() {
        XCTAssertTrue(AnswerSources.of("[x](https://chatgpt.com/share/abc) [y](https://claude.ai/chat/1)").isEmpty)
    }

    func testTheLabelLosesMarkdownDecorationAndFallsBackToTheHost() {
        let s = AnswerSources.of("[**Bold _label_**](https://example.org/a) [  ](https://example.net/b)")
        XCTAssertEqual(s.first?.label, "Bold label")
        XCTAssertEqual(s.last?.label, "example.net")
    }

    func testAtMostTwelveSources() {
        let text = (1...20).map { "[s\($0)](https://example.org/p\($0))" }.joined(separator: " ")
        XCTAssertEqual(AnswerSources.of(text).count, 12)
    }

    func testNoLinksNoChip() {
        XCTAssertTrue(AnswerSources.of("").isEmpty)
        XCTAssertTrue(AnswerSources.of("Chỉ là chữ, không có liên kết.").isEmpty)
    }

    func testBadgesAreTheFirstLettersOfUpToThreeDifferentSites() {
        let s = AnswerSources.of("[a](https://vnexpress.net/1) [b](https://vnexpress.net/2) [c](https://tuoitre.vn/3) [d](https://zing.vn/4) [e](https://baomoi.com/5)")
        XCTAssertEqual(AnswerSources.badgeLetters(s), ["V", "T", "Z"])
    }

    func testTheLabelIsEscapedBeforeItGoesIntoAMarkdownLink() {
        XCTAssertEqual(SourcesFooterView.escaped("a [b] c"), "a \\[b\\] c")
    }

    func testTheChipTitleHasACatalogEntryWithTheCount() {
        let title = NSLocalizedString("chat.sources.title", comment: "")
        XCTAssertNotEqual(title, "chat.sources.title")
        XCTAssertTrue(String(format: title, 3).contains("3"))
    }
}
