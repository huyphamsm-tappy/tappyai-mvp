import XCTest
import PDFKit
@testable import TappyAI

/// The drawn PDF, checked lightly (the layout rules are in `ReportPdfLayoutTests`): the file is a PDF the system's reader opens, it has as many
/// pages as the counting pass said (the footer's "n / N" is written from that count), a long report runs over pages, and a table that cannot be
/// a grid still produces a file.
final class ReportPdfRenderTests: XCTestCase {

    private let sample = "# Xe điện 2026\n\nMở đầu có **đậm** và [BYD](https://byd.com/a).\n\n## Doanh số\n\n- BYD dẫn đầu\n- Tesla thứ hai\n\n| Hãng | Xe |\n|---|---|\n| BYD | 2,26 tr [1] |\n| Tesla | 1,64 tr |\n\n### Nguồn\n\n1. BYD sales — https://byd.com/a\n"

    private func longReport(sections: Int) -> String {
        (1...sections).map { i in
            "## Phần \(i)\n\n" + String(repeating: "Đây là một câu khá dài để đoạn văn chạy qua nhiều dòng trên trang A4. ", count: 12)
        }.joined(separator: "\n\n")
    }

    func testTheFileIsAPdfTheSystemReaderOpens() throws {
        let data = writeReportPdf(title: "Xe điện 2026", blocks: pdfBlocks(sample))
        XCTAssertEqual(String(data: data.prefix(4), encoding: .ascii), "%PDF")
        let doc = try XCTUnwrap(PDFDocument(data: data))
        XCTAssertGreaterThan(doc.pageCount, 0)
    }

    func testThePagesAreTheCountingPassesAndTheFootersCarryNOverN() throws {
        let blocks = pdfBlocks(longReport(sections: 12))
        let counted = pdfPageCount(title: "Dài", blocks: blocks)
        XCTAssertGreaterThan(counted, 1)
        let doc = try XCTUnwrap(PDFDocument(data: writeReportPdf(title: "Dài", blocks: blocks)))
        XCTAssertEqual(doc.pageCount, counted)
        let text = doc.string ?? ""
        XCTAssertTrue(text.contains(pageLabel(counted, counted)), text)
    }

    func testAnEmptyReportStillMakesOnePage() throws {
        let doc = try XCTUnwrap(PDFDocument(data: writeReportPdf(title: "", blocks: [])))
        XCTAssertEqual(doc.pageCount, 1)
    }

    func testATableOfFortyOneColumnsAndARowTallerThanAPageStillMakeAFile() throws {
        let wide = (0..<41).map { "c\($0)" }
        let tall = [["Mục", String(repeating: "rất dài ", count: 4000)], ["a", "b"]]
        let blocks = [PdfBlock(level: 0, text: "", rows: [wide, wide]), PdfBlock(level: 0, text: "", rows: tall)]
        let doc = try XCTUnwrap(PDFDocument(data: writeReportPdf(title: "Bảng", blocks: blocks)))
        XCTAssertGreaterThan(doc.pageCount, 1)
    }

    func testAShortReportIsOnePage() {
        XCTAssertEqual(pdfPageCount(title: "Xe điện", blocks: [PdfBlock(level: 1, text: "Xe điện")]), 1)
        XCTAssertEqual(pdfPageCount(title: "Xe điện", blocks: pdfBlocks(sample)), 1)
    }
}
