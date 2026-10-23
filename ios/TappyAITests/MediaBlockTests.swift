import XCTest
@testable import TappyAI

/// `[TAPPY_MEDIA]` on the client. Twin of web `mediaHosts.ts` and Android `MediaBlockTest`: the raw JSON never
/// shows, and no URL outside the allow-lists survives parsing.
@MainActor
final class MediaBlockTests: XCTestCase {

    private let prose = "Tin mới hôm nay."

    private func news(_ src: String, _ href: String) -> String {
        #"[TAPPY_MEDIA]{"v":1,"kind":"news","items":[{"src":"\#(src)","href":"\#(href)","label":"VnExpress","title":"Tiêu đề"}]}[/TAPPY_MEDIA]"#
    }

    func testAValidNewsBlockIsParsedAndRemovedFromTheProse() {
        let parsed = ContentParser.parse(prose + news("https://i1-vnexpress.vnecdn.net/a.jpg", "https://vnexpress.net/bai-1.html"))

        XCTAssertEqual(parsed.text, prose)
        guard case .news(let items)? = parsed.media.first else { return XCTFail("expected a news block") }
        XCTAssertEqual(items.first?.src, "https://i1-vnexpress.vnecdn.net/a.jpg")
        XCTAssertFalse(parsed.text.contains("TAPPY_MEDIA"))
    }

    func testAHostOutsideTheAllowListDropsTheItem() {
        let badImage = ContentParser.parse(prose + news("https://evil.example/a.jpg", "https://vnexpress.net/bai-1.html"))
        XCTAssertEqual(badImage.text, prose)
        XCTAssertTrue(badImage.media.isEmpty)

        let badPage = ContentParser.parse(prose + news("https://i1-vnexpress.vnecdn.net/a.jpg", "https://evil.example/x"))
        XCTAssertTrue(badPage.media.isEmpty)
    }

    func testHttpCredentialsInternalNamesAndIPLiteralsAreNeverAllowed() {
        for src in [
            "http://i1-vnexpress.vnecdn.net/a.jpg",
            "https://user:pw@i1-vnexpress.vnecdn.net/a.jpg",
            "https://localhost/a.jpg",
            "https://127.0.0.1/a.jpg",
            "https://[::1]/a.jpg",
            "https://upload.wikimedia.org.evil.example/a.jpg",
            "https://notvnecdn.net/a.jpg",
        ] {
            XCTAssertFalse(MediaBlocks.isAllowedImage(src), src)
        }
        XCTAssertTrue(MediaBlocks.isAllowedImage("https://upload.wikimedia.org/wikipedia/commons/a.jpg"))
    }

    func testAWikipediaLinkMustBeAnArticlePage() {
        XCTAssertTrue(MediaBlocks.isAllowedPage("https://vi.wikipedia.org/wiki/Ha_Noi"))
        XCTAssertFalse(MediaBlocks.isAllowedPage("https://vi.wikipedia.org/w/index.php?search=x"))
        XCTAssertFalse(MediaBlocks.isAllowedPage("https://vi.wikipedia.org/wiki/A?x=1"))
    }

    func testAnEntityCardKeepsTheSubjectAndDropsADisallowedImageOnly() {
        let body = #"{"v":1,"kind":"entity","entity":{"name":"Hà Nội","summary":"Thủ đô của Việt Nam.","image":"https://evil.example/i.jpg","href":"https://vi.wikipedia.org/wiki/H%C3%A0_N%E1%BB%99i","source":"Wikipedia"}}"#
        let parsed = ContentParser.parse("\(prose)[TAPPY_MEDIA]\(body)[/TAPPY_MEDIA]")

        guard case .entities(let list)? = parsed.media.first else { return XCTFail("expected an entity card") }
        XCTAssertEqual(list.first?.name, "Hà Nội")
        XCTAssertNil(list.first?.image)
        XCTAssertEqual(parsed.text, prose)
    }

    func testAComparisonKeepsAtMostThreeDistinctSubjects() {
        func e(_ n: Int) -> String { #"{"name":"E\#(n)","summary":"s\#(n)","href":"https://en.wikipedia.org/wiki/E\#(n)"}"# }
        let body = #"{"v":1,"kind":"entities","entities":[\#(e(1)),\#(e(1)),\#(e(2)),\#(e(3)),\#(e(4))]}"#
        let parsed = ContentParser.parse("[TAPPY_MEDIA]\(body)[/TAPPY_MEDIA]")

        guard case .entities(let list)? = parsed.media.first else { return XCTFail("expected entities") }
        XCTAssertEqual(list.map(\.name), ["E1", "E2", "E3"])
    }

    func testMalformedTruncatedOrWrongVersionBlocksAreInvisibleAndYieldNothing() {
        for raw in [
            "\(prose)[TAPPY_MEDIA]{not json[/TAPPY_MEDIA]",
            "\(prose)[TAPPY_MEDIA]{\"v\":1,\"kind\":\"news\",\"items\":[{\"sr",
            "\(prose)[TAPPY_MEDIA]{\"v\":2,\"kind\":\"news\",\"items\":[]}[/TAPPY_MEDIA]",
            "\(prose)[/TAPPY_MEDIA]",
        ] {
            let parsed = ContentParser.parse(raw)
            XCTAssertEqual(parsed.text, prose, raw)
            XCTAssertTrue(parsed.media.isEmpty, raw)
        }
    }

    func testOtherMarkersAroundAMediaBlockStillDecode() {
        let parsed = ContentParser.parse(
            prose + news("https://i1-vnexpress.vnecdn.net/a.jpg", "https://vnexpress.net/bai-1.html")
                + "[FOLLOWUPS]Thêm tin|Tin khác[/FOLLOWUPS]")
        XCTAssertEqual(parsed.text, prose)
        XCTAssertEqual(parsed.followups, ["Thêm tin", "Tin khác"])
        XCTAssertEqual(parsed.media.count, 1)
    }

    func testAMediaOnlyReplyIsAReplyNotAnEmptyOne() {
        let content = news("https://i1-vnexpress.vnecdn.net/a.jpg", "https://vnexpress.net/bai-1.html")
        XCTAssertFalse(ChatViewModel.streamProducedNothing(content: content, hasPlaces: false))
    }
}
