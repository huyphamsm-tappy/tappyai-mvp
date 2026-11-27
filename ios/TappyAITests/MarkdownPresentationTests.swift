import XCTest
@testable import TappyAI

/// Layout step 2 (owner spec 26/11, §B): the presentation of an answer's blocks is decided from the text's own structure. These pin each rule on
/// a text written the way the model writes it, with no reference to any subject.
final class MarkdownPresentationTests: XCTestCase {

    private func items(_ markdown: String) -> [PresentedBlock] {
        MarkdownPresentation.items(MarkdownBlocks.parse(markdown))
    }

    // MARK: Data box

    func testAShortLineEndingWithAColonAboveATableIsItsTitleAndTheShortLineBelowIsItsCaption() {
        let result = items("Doanh số theo năm:\n| Năm | Doanh số |\n|---|---|\n| 2024 | 10 |\nNguồn: thống kê nội bộ")
        XCTAssertEqual(result, [.dataBox(title: "Doanh số theo năm", rows: [["Năm", "Doanh số"], ["2024", "10"]],
                                         caption: "Nguồn: thống kê nội bộ")])
    }

    func testAParagraphWithoutAColonIsNotATitle() {
        let result = items("Đây là một đoạn văn.\n| A | B |\n|---|---|\n| 1 | 2 |")
        XCTAssertEqual(result, [.block(.paragraph("Đây là một đoạn văn.")), .dataBox(title: nil, rows: [["A", "B"], ["1", "2"]], caption: nil)])
    }

    func testATitleOnlyTakesItsOwnLineWhenTheParagraphHasMoreLines() {
        let result = items("Câu mở đầu.\nBảng số liệu:\n| A | B |\n|---|---|\n| 1 | 2 |")
        XCTAssertEqual(result, [.block(.paragraph("Câu mở đầu.")), .dataBox(title: "Bảng số liệu", rows: [["A", "B"], ["1", "2"]], caption: nil)])
    }

    func testALongLineIsNeverATitle() {
        let long = String(repeating: "x", count: 95) + ":"
        XCTAssertNil(MarkdownPresentation.titleLine(long))
    }

    func testAMultiLineCaptionIsNotACaption() {
        XCTAssertNil(MarkdownPresentation.captionLine("một dòng\nhai dòng"))
        XCTAssertNil(MarkdownPresentation.captionLine(String(repeating: "y", count: 161)))
        XCTAssertEqual(MarkdownPresentation.captionLine("Chú thích ngắn"), "Chú thích ngắn")
    }

    // MARK: Numbered headings

    func testTwoUnnumberedLevelTwoHeadingsAreNumbered() {
        let result = items("## Thị trường\nNội dung.\n## Giá cả\nNội dung khác.")
        XCTAssertEqual(result.compactMap { if case .block(.heading(2, let t)) = $0 { return t } else { return nil } },
                       ["1. Thị trường", "2. Giá cả"])
    }

    func testASingleHeadingIsNotNumbered() {
        let result = items("## Kết luận\nNội dung.")
        XCTAssertEqual(result.first, .block(.heading(level: 2, text: "Kết luận")))
    }

    func testAHeadingTheModelNumberedKeepsItsNumber() {
        let result = items("## 2. Thị trường\nNội dung.\n## Giá cả\nNội dung khác.")
        XCTAssertEqual(result.compactMap { if case .block(.heading(2, let t)) = $0 { return t } else { return nil } },
                       ["2. Thị trường", "2. Giá cả"])
    }

    // MARK: Quote and order stay as they are

    func testAQuoteStaysAQuoteBlock() {
        XCTAssertEqual(items("> Lưu ý: số liệu chưa xác minh."), [.block(.quote("Lưu ý: số liệu chưa xác minh."))])
    }

    func testTheAnswerDocumentEntryGivesTheSameItemsAsTheParserAndThePresentation() {
        let markdown = "Doanh số:\n| Năm | Số |\n|---|---|\n| 2024 | 10 |\nNguồn: nội bộ\n## Một\nĐoạn.\n## Hai\nĐoạn."
        XCTAssertEqual(AnswerDocument.items(markdown), MarkdownPresentation.items(MarkdownBlocks.parse(markdown)))
    }

    // MARK: Glued heading repair (AnswerDocument)

    func testAHeadingStuckToTheEndOfASentenceIsBrokenOntoItsOwnLine() {
        XCTAssertEqual(AnswerDocument.repaired("Đoạn đầu nhé.## Tiêu đề\nNội dung."), "Đoạn đầu nhé.\n## Tiêu đề\nNội dung.")
        XCTAssertEqual(AnswerDocument.items("Đoạn đầu nhé.## Tiêu đề\nNội dung."),
                       [.block(.paragraph("Đoạn đầu nhé.")), .block(.heading(level: 2, text: "Tiêu đề")), .block(.paragraph("Nội dung."))])
    }

    func testAHashInsideAWordIsNotAHeading() {
        XCTAssertEqual(AnswerDocument.repaired("Ngôn ngữ C# rất phổ biến."), "Ngôn ngữ C# rất phổ biến.")
        XCTAssertEqual(AnswerDocument.repaired("Xem #hashtag nhé."), "Xem #hashtag nhé.")
    }

    func testACodeBlockIsNeverChanged() {
        let code = "```\nvalue.## not a heading\n```"
        XCTAssertEqual(AnswerDocument.repaired(code), code)
    }

    func testAHeadingAtTheStartOfALineIsLeftAlone() {
        XCTAssertEqual(AnswerDocument.repaired("## Đã đúng\nNội dung."), "## Đã đúng\nNội dung.")
    }

    func testTheOrderOfBlocksIsKept() {
        let result = items("# Tiêu đề\nĐoạn đầu.\n- một\n- hai")
        XCTAssertEqual(result, [.block(.heading(level: 1, text: "Tiêu đề")), .block(.paragraph("Đoạn đầu.")),
                                .block(.bullet(depth: 0, text: "một")), .block(.bullet(depth: 0, text: "hai"))])
    }
}
