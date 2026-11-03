import XCTest
import PDFKit
@testable import TappyAI

/// Re-audit 02/11 (iOS), the small rounding-off: the save-place button follows the web's rule, a table cell may hold an escaped pipe,
/// `*` between spaces is not italic, and a table that runs over a page keeps its column names.
final class ChatRoundOffTests: XCTestCase {

    // MARK: - «Lưu địa điểm» (web `replyHasSavablePlace`)

    private func button(_ type: String) -> CTAButton { CTAButton(label: "x", type: type, url: "https://example.vn/a", primary: false) }

    func testAPlaceCardOrAMapsOrBookingButtonOffersSaving() {
        XCTAssertTrue(ContentParser.replyHasSavablePlace(text: "Gợi ý", buttons: [], hasPlaceCards: true))
        for type in ["maps", "booking", "internal_booking"] {
            XCTAssertTrue(ContentParser.replyHasSavablePlace(text: "Gợi ý", buttons: [button(type)], hasPlaceCards: false), type)
        }
    }

    func testAButtonThatOnlyOpensAShopOrALinkDoesNotOfferSaving() {
        for type in ["external", "affiliate", "link", "call"] {
            XCTAssertFalse(ContentParser.replyHasSavablePlace(text: "Mua ở đây", buttons: [button(type)], hasPlaceCards: false), type)
        }
    }

    func testABoldNameCountsOnlyWhenARatingAnAddressOrHoursFollow() {
        XCTAssertTrue(ContentParser.replyHasSavablePlace(text: "**Phở Thìn** ⭐ 4,5 — quán lâu năm", buttons: [], hasPlaceCards: false))
        XCTAssertTrue(ContentParser.replyHasSavablePlace(text: "**Cà phê Cộng** mở 07:00 đến 22:00", buttons: [], hasPlaceCards: false))
        XCTAssertTrue(ContentParser.replyHasSavablePlace(text: "**Bún chả Hương Liên** 24 đường Lê Văn Hưu", buttons: [], hasPlaceCards: false))
        XCTAssertFalse(ContentParser.replyHasSavablePlace(text: "Nhớ **cần check kỹ** bảo hành trước khi mua", buttons: [], hasPlaceCards: false),
                       "a bold phrase alone is not a place")
        XCTAssertFalse(ContentParser.replyHasSavablePlace(text: "Không có gì ở đây", buttons: [], hasPlaceCards: false))
    }

    // MARK: - Escaped pipe in a table cell (GFM)

    func testAnEscapedPipeStaysInsideItsCellInTheChatAndThePdf() {
        let md = "| Tên | Ghi chú |\n|---|---|\n| A | x \\| y |\n"
        let chat = MarkdownBlocks.parse(md)
        guard case .table(let rows) = chat.first(where: { if case .table = $0 { return true } else { return false } }) else {
            return XCTFail("a table block")
        }
        XCTAssertEqual(rows.last, ["A", "x | y"])
        let pdf = pdfBlocks(md).first(where: { $0.rows != nil })
        XCTAssertEqual(pdf?.rows?.last, ["A", "x | y"])
    }

    // MARK: - `*` between spaces is not italic (Word export)

    func testAStarBetweenSpacesIsNotItalicButAWordInStarsIs() {
        XCTAssertFalse(inlineRuns("2 * 3 * 4").contains { $0.italic }, "arithmetic is not emphasis")
        XCTAssertEqual(inlineRuns("một *nghiêng* hai").first(where: { $0.italic })?.text, "nghiêng")
        XCTAssertEqual(inlineRuns("một *hai từ* ba").first(where: { $0.italic })?.text, "hai từ")
    }

    // MARK: - A table over a page keeps its header row

    func testEveryPageOfALongTableStartsWithTheColumnNames() throws {
        var md = "| Cột đầu | Cột hai |\n|---|---|\n"
        for i in 1...140 { md += "| Hàng \(i) | giá trị \(i) |\n" }
        let data = writeReportPdf(title: "Bảng dài", blocks: pdfBlocks(md))
        let doc = try XCTUnwrap(PDFDocument(data: data))
        XCTAssertGreaterThan(doc.pageCount, 1)
        for index in 1..<doc.pageCount {
            let text = doc.page(at: index)?.string ?? ""
            XCTAssertTrue(text.contains("Cột đầu"), "page \(index + 1) has no header row")
        }
    }
}
