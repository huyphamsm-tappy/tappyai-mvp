import XCTest
@testable import TappyAI

/// The answer's Markdown cut into blocks (Android `TappyMarkdown.parseBlocks`, web formatMessage): what is a heading, a list line, a table, a code
/// block, and what is only a line of text. Pure: no view, no clock.
final class MarkdownBlocksTests: XCTestCase {
    private func parse(_ s: String) -> [MarkdownBlock] { MarkdownBlocks.parse(s) }

    // MARK: - Headings

    func testHeadingsKeepTheirLevelOneToSix() {
        let blocks = parse("# A\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F")
        XCTAssertEqual(blocks, [
            .heading(level: 1, text: "A"), .heading(level: 2, text: "B"), .heading(level: 3, text: "C"),
            .heading(level: 4, text: "D"), .heading(level: 5, text: "E"), .heading(level: 6, text: "F"),
        ])
    }

    func testAClosingRunOfHashesIsNotPartOfTheHeadingAndAHashtagIsNotAHeading() {
        XCTAssertEqual(parse("## Giá vé ##"), [.heading(level: 2, text: "Giá vé")])
        XCTAssertEqual(parse("## C# cơ bản"), [.heading(level: 2, text: "C# cơ bản")])
        XCTAssertEqual(parse("#hashtag"), [.paragraph("#hashtag")])
        XCTAssertEqual(parse("####### bảy"), [.paragraph("####### bảy")], "seven marks is not a heading")
    }

    func testAHeadingStuckToTheListUnderItIsABlockOfItsOwn() {
        let blocks = parse("## Ăn gì\n- Bún bò\n- Mì Quảng\nHết")
        XCTAssertEqual(blocks, [
            .heading(level: 2, text: "Ăn gì"),
            .bullet(depth: 0, text: "Bún bò"),
            .bullet(depth: 0, text: "Mì Quảng"),
            .paragraph("Hết"),
        ])
    }

    func testAnEmptyHeadingIsDropped() {
        XCTAssertEqual(parse("## \nChữ"), [.paragraph("Chữ")])
    }

    // MARK: - Paragraphs

    func testConsecutiveLinesStayOneParagraphWithTheirLineBreaksAndABlankLineEndsIt() {
        XCTAssertEqual(parse("Một\nHai\n\nBa"), [.paragraph("Một\nHai"), .paragraph("Ba")])
    }

    func testBoldAtTheStartOfALineIsAParagraphNotAListItem() {
        XCTAssertEqual(parse("**Lưu ý:** mang áo mưa"), [.paragraph("**Lưu ý:** mang áo mưa")])
    }

    func testWindowsLineEndingsAreRead() {
        XCTAssertEqual(parse("# A\r\n- b\r\n\r\nc"), [.heading(level: 1, text: "A"), .bullet(depth: 0, text: "b"), .paragraph("c")])
    }

    func testEmptyAndBlankInputGiveNoBlocks() {
        XCTAssertEqual(parse(""), [])
        XCTAssertEqual(parse("  \n\n \n"), [])
    }

    // MARK: - Lists

    func testEveryBulletMarkIsABulletAndIndentationIsItsDepth() {
        let blocks = parse("- a\n* b\n+ c\n• d\n  - e\n    - f\n          - g")
        XCTAssertEqual(blocks, [
            .bullet(depth: 0, text: "a"), .bullet(depth: 0, text: "b"), .bullet(depth: 0, text: "c"), .bullet(depth: 0, text: "d"),
            .bullet(depth: 1, text: "e"), .bullet(depth: 2, text: "f"), .bullet(depth: 3, text: "g"),
        ])
    }

    func testAnEmptyBulletIsDropped() {
        XCTAssertEqual(parse("- \n- a"), [.bullet(depth: 0, text: "a")])
    }

    func testNumberedLinesKeepTheModelsOwnNumbers() {
        XCTAssertEqual(parse("1. Một\n2) Hai\n\nĐoạn chen\n\n3. Ba"), [
            .numbered(n: 1, depth: 0, text: "Một"), .numbered(n: 2, depth: 0, text: "Hai"),
            .paragraph("Đoạn chen"),
            .numbered(n: 3, depth: 0, text: "Ba"),
        ])
    }

    func testANumberedLineWithoutASpaceAfterTheDotIsText() {
        XCTAssertEqual(parse("3.5 sao"), [.paragraph("3.5 sao")])
    }

    // MARK: - Quote, rule, code

    func testConsecutiveQuoteLinesAreOneQuoteWithoutTheMarks() {
        XCTAssertEqual(parse("> một\n> hai\n>ba"), [.quote("một\nhai\nba")])
    }

    func testARuleIsNotAListItem() {
        XCTAssertEqual(parse("a\n\n---\n\n***\n\n___"), [.paragraph("a"), .rule, .rule, .rule])
    }

    func testACodeBlockKeepsItsLinesAsWrittenEvenWhenTheyLookLikeMarkdown() {
        let blocks = parse("Chạy:\n```swift\n# not a heading\n- not a bullet\n\n| a | b |\n```\nXong")
        XCTAssertEqual(blocks, [
            .paragraph("Chạy:"),
            .code(lines: ["# not a heading", "- not a bullet", "", "| a | b |"]),
            .paragraph("Xong"),
        ])
    }

    func testACodeBlockStillOpenWhileTheReplyStreamsTakesTheRest() {
        XCTAssertEqual(parse("```\nlet x = 1\nlet y"), [.code(lines: ["let x = 1", "let y"])])
    }

    // MARK: - Tables

    func testATableDropsItsSeparatorRowAndTrimsItsCells() {
        let blocks = parse("| Hãng |  Xe  |\n|:---|---:|\n|  BYD | Seal |\n| Tesla | Model 3 |")
        XCTAssertEqual(blocks, [.table(rows: [["Hãng", "Xe"], ["BYD", "Seal"], ["Tesla", "Model 3"]])])
    }

    func testATableWithoutOuterPipesIsRecognised() {
        XCTAssertEqual(parse("a | b\n--- | ---\n1 | 2"), [.table(rows: [["a", "b"], ["1", "2"]])])
    }

    func testATableStartingRightUnderASentenceIsStillATable() {
        let blocks = parse("So sánh nhanh:\n| A | B |\n|---|---|\n| 1 | 2 |\nHết bảng")
        XCTAssertEqual(blocks.first, .paragraph("So sánh nhanh:"))
        XCTAssertEqual(blocks.dropFirst().first, .table(rows: [["A", "B"], ["1", "2"]]))
    }

    func testAShortRowIsPaddedAndALongOneCut() {
        let blocks = parse("| A | B | C |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |")
        XCTAssertEqual(blocks, [.table(rows: [["A", "B", "C"], ["1", "", ""], ["1", "2", "3"]])])
    }

    func testAPipeLineWithoutASeparatorRowStaysText() {
        XCTAssertEqual(parse("| a | b |\n| c | d |"), [.paragraph("| a | b |\n| c | d |")])
    }

    func testATableEndsAtABlankLine() {
        let blocks = parse("| A |\n|---|\n| 1 |\n\nSau bảng")
        XCTAssertEqual(blocks, [.table(rows: [["A"], ["1"]]), .paragraph("Sau bảng")])
    }

    // MARK: - hasStructure

    func testOnlyPlainParagraphsHaveNoStructure() {
        XCTAssertFalse(MarkdownBlocks.hasStructure(parse("Một đoạn.\n\nMột đoạn nữa, có **đậm** và [link](https://a.vn).")))
        XCTAssertFalse(MarkdownBlocks.hasStructure([]))
        for text in ["# T", "- a", "1. a", "> q", "```\nx\n```", "| a |\n|---|\n| 1 |", "---"] {
            XCTAssertTrue(MarkdownBlocks.hasStructure(parse(text)), text)
        }
    }

    // MARK: - Inline reading (the one reader the blocks use)

    func testAnUnderscoreInsideAWordIsNotItalic() {
        XCTAssertEqual(MarkdownBlocks.plain("mã ABC_123 và XYZ_456"), "mã ABC_123 và XYZ_456")
        XCTAssertEqual(MarkdownBlocks.plain("tin_a_b"), "tin_a_b")
    }

    func testBoldAndItalicMarksAreReadNotPrinted() {
        XCTAssertEqual(MarkdownBlocks.plain("một **đậm** và *nghiêng* và `mã`"), "một đậm và nghiêng và mã")
    }

    func testALinkReadsAsItsLabelAndAnAddressWithBracketsIsOneLink() {
        let rendered = ContentParser.renderMarkdown("xem [Foo](https://vi.wikipedia.org/wiki/Foo_(bar)) nhé")
        XCTAssertEqual(String(rendered.characters), "xem Foo nhé")
        let links = rendered.runs.compactMap { $0.link?.absoluteString }
        XCTAssertEqual(links, ["https://vi.wikipedia.org/wiki/Foo_(bar)"])
    }

    func testOnlyHttpLinksStayLinks() {
        for address in ["javascript:alert(1)", "intent://x#Intent;end", "tel:+84123", "file:///etc/passwd"] {
            let rendered = ContentParser.renderMarkdown("[nhãn](\(address))")
            XCTAssertEqual(String(rendered.characters), "nhãn", address)
            XCTAssertTrue(rendered.runs.allSatisfy { $0.link == nil }, "\(address) is not a link")
        }
    }

    func testALinkToAnotherAiProductLosesItsAddressInTheWholePipeline() {
        let parsed = ContentParser.parse("## Nguồn\n- [Bài viết](https://chatgpt.com/share/abc) hay")
        let blocks = MarkdownBlocks.parse(parsed.text)
        XCTAssertFalse(parsed.text.contains("chatgpt.com"))
        XCTAssertEqual(blocks.count, 2)
    }
}
