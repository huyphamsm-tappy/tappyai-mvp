import XCTest
@testable import TappyAI

/// `ContentParser.parse(...).segments`: the prose and the pictures in the order the model wrote them (Android `ReplySegment`). The older
/// `text` / `images` fields stay exactly as they were (ContentParserImageTests); these tests pin the new, positional view.
final class ReplySegmentsTests: XCTestCase {
    private let a = "https://cdn.example/a.png"
    private let b = "https://cdn.example/b.png"

    private func segments(_ content: String) -> [ReplySegment] { ContentParser.parse(content).segments }

    func testAPictureSitsBetweenTheWordsBeforeAndAfterIt() {
        XCTAssertEqual(segments("Trước nhé.\n\n![A](\(a))\n\nSau nhé."), [
            .text("Trước nhé."), .images([ParsedImage(alt: "A", url: a)]), .text("Sau nhé."),
        ])
    }

    func testPicturesWithOnlyBlankSpaceBetweenThemAreOneRun() {
        XCTAssertEqual(segments("![A](\(a))\n\n![B](\(b))\nChữ"), [
            .images([ParsedImage(alt: "A", url: a), ParsedImage(alt: "B", url: b)]), .text("Chữ"),
        ])
    }

    func testWordsBetweenTwoPicturesSplitThemIntoTwoRuns() {
        XCTAssertEqual(segments("![A](\(a)) giữa ![B](\(b))"), [
            .images([ParsedImage(alt: "A", url: a)]), .text("giữa"), .images([ParsedImage(alt: "B", url: b)]),
        ])
    }

    func testAReplyWithoutPicturesIsOneTextPieceEqualToTheText() {
        let parsed = ContentParser.parse("## Tiêu đề\n- một\n- hai")
        XCTAssertEqual(parsed.segments, [.text(parsed.text)])
        XCTAssertEqual(ContentParser.parse("").segments, [])
    }

    func testAPictureThatIsNotDrawnIsRemovedWithoutBreakingTheText() {
        // http is dropped, and so is a picture a page of another AI product serves; the words around them stay one piece
        let content = "Một ![x](http://insecure.example/x.png) hai ![y](https://chatgpt.com/img/y.png) ba"
        let parsed = ContentParser.parse(content)
        XCTAssertEqual(parsed.images, [])
        XCTAssertEqual(parsed.segments.count, 1)
        guard case .text(let only)? = parsed.segments.first else { return XCTFail("one text piece") }
        XCTAssertTrue(only.contains("Một") && only.contains("hai") && only.contains("ba"))
        XCTAssertFalse(only.contains("insecure.example") || only.contains("chatgpt.com"))
    }

    func testAListMarkLeftAloneByItsPictureIsNotAStrayLine() {
        let segs = segments("Món ngon:\n- ![Bún](\(a))\n- Mì")
        XCTAssertEqual(segs.first, .text("Món ngon:"), "the lone \"-\" is not left on the line before the picture")
        XCTAssertEqual(segs.dropFirst().first, .images([ParsedImage(alt: "Bún", url: a)]))
    }

    func testThePicturesOfTheSegmentsAreTheSamePicturesAsImages() {
        let parsed = ContentParser.parse("x ![A](\(a)) y ![B](\(b)) z ![A](\(a))")
        let fromSegments = parsed.segments.flatMap { segment -> [ParsedImage] in
            if case .images(let images) = segment { return images }
            return []
        }
        XCTAssertEqual(fromSegments, parsed.images)
    }

    func testNoRunOfBlankLinesIsLeftInAPiece() {
        let segs = segments("Một\n\n\n\n![A](\(a))\n\n\n\nHai\n\n\n\nBa")
        XCTAssertEqual(segs.last, .text("Hai\n\nBa"))
    }

    func testTheOlderFieldsAreUnchangedByThePositionalOne() {
        let parsed = ContentParser.parse("Mình gợi ý.\n\n![Bún bò](\(a))\n\nNguồn: https://example.vn/x")
        XCTAssertEqual(parsed.images.map(\.url), [a])
        XCTAssertTrue(parsed.text.contains("Mình gợi ý."))
        XCTAssertFalse(parsed.text.contains("Bún bò"))
    }
}
