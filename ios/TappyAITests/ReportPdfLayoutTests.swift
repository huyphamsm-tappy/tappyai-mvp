import XCTest
@testable import TappyAI

/// The pure parts of the report's PDF (web `reportExport.ts` after its 01/11 fix, Android `ReportExportLayoutTest` / `ReportLinksAndMarkTest`):
/// how the text is cut into blocks, how a table and the sources list are read, and the rules that keep a heading with what follows and a table
/// readable. The drawing itself is checked lightly in `ReportPdfRenderTests`.
final class ReportPdfLayoutTests: XCTestCase {
    private let wiki = "https://vi.wikipedia.org/wiki/Hà_Nội_(thành_phố)"

    func testThePdfReadsComfortablyBodyTwelvePointOrMoreLinesAtOnePointFourOrMoreHeadingsInOrder() {
        XCTAssertGreaterThanOrEqual(PdfStyle.body, 12)
        XCTAssertGreaterThanOrEqual(PdfStyle.lineMultiple, 1.4)
        XCTAssertTrue(PdfStyle.title > PdfStyle.h1 && PdfStyle.h1 > PdfStyle.h2 && PdfStyle.h2 > PdfStyle.h3 && PdfStyle.h3 > PdfStyle.body)
        XCTAssertGreaterThanOrEqual(PdfStyle.margin, 56)
        XCTAssertEqual(PdfStyle.pageW, 595)
        XCTAssertEqual(PdfStyle.pageH, 842)
    }

    func testAMarkdownTableIsOneTableBlockWithItsHeaderAndRowsMarksStrippedAndTheSeparatorDropped() throws {
        let md = "## Doanh số\n\n| Hãng | Xe |\n|---|---|\n| **BYD** | 2,26 tr [1] |\n| Tesla | 1,64 tr |\n\nHết."
        let blocks = pdfBlocks(md)
        let tables = blocks.filter { $0.rows != nil }
        XCTAssertEqual(tables.count, 1)
        XCTAssertEqual(tables[0].rows, [["Hãng", "Xe"], ["BYD", "2,26 tr [1]"], ["Tesla", "1,64 tr"]])
        XCTAssertEqual(blocks.filter { $0.rows == nil }.map { $0.text }, ["Doanh số", "Hết."])
    }

    func testABlockThatIsNotATableHasNoRows() throws {
        XCTAssertNil(try XCTUnwrap(pdfBlocks("Một đoạn thường.\n\n- một ý\n- ý hai").first).rows)
        XCTAssertNil(try XCTUnwrap(pdfBlocks("| chỉ một dòng có gạch đứng |").first).rows)
    }

    func testTheSourcesListOfThePdfCarriesEachAddress() {
        let text = "# Xe điện\n\n## Doanh số\nBYD dẫn đầu [1].\n\n### Nguồn\n1. BYD sales — byd.com\n2. Không có link — x.example\n"
        let out = reportForPdf(text, [ResearchLink(id: 1, title: "BYD [sales]", url: "https://byd.com/a"),
                                      ResearchLink(id: 2, title: "bad", url: "javascript:alert(1)")])
        XCTAssertTrue(out.contains("1. BYD sales — https://byd.com/a"), out)
        XCTAssertTrue(out.contains("2. Không có link — x.example"), out) // no https address: stays as it is
        XCTAssertTrue(out.contains("BYD dẫn đầu [1]."), out)
    }

    func testThePdfBlocksKeepAnAddressInTheTextAPdfHasNoLinkToTap() throws {
        let text = "### Nguồn\n1. BYD sales — https://byd.com/a\n2. Báo — https://vnexpress.net/x?id=1&p=2"
        let last = try XCTUnwrap(pdfBlocks(reportForPdf(text, [ResearchLink(id: 1, title: "BYD sales", url: "https://byd.com/a")])).last)
        XCTAssertTrue(last.text.contains("https://byd.com/a"), last.text)
        XCTAssertTrue(last.text.contains("https://vnexpress.net/x?id=1&p=2"), last.text)
        // a link written as [label](address) in a sentence still reads as its label
        XCTAssertEqual(pdfBlocks("Xem [BYD](https://byd.com/a).").first?.text, "Xem BYD.")
    }

    func testTheReportWritesAnAddressWithBracketsSoEveryReaderKeepsItWhole() {
        let text = "# T\n\ntext\n\n## Nguồn\n\n1. Hà Nội — vi.wikipedia.org\n"
        let links = [ResearchLink(id: 1, title: "Hà Nội", url: wiki)]
        XCTAssertTrue(reportMarkdown(text, links).contains("(https://vi.wikipedia.org/wiki/Hà_Nội_%28thành_phố%29)"))
        XCTAssertTrue(reportForPdf(text, links).contains("1. Hà Nội — https://vi.wikipedia.org/wiki/Hà_Nội_%28thành_phố%29"))
    }

    func testALinkWhoseAddressHasBracketsReadsAsItsLabel() {
        XCTAssertEqual(pdfBlocks("[Hà Nội](\(wiki))").first?.text, "Hà Nội")
        XCTAssertEqual(pdfBlocks("xem [Foo](https://x.org/Foo_(bar)) rồi tiếp").first?.text, "xem Foo rồi tiếp")
    }

    func testAHeadingIsNeverLeftAloneAtTheBottomOfAPageAndThePageLabelReadsNOverN() {
        let bottom: CGFloat = 700
        XCTAssertTrue(keepHeadingWithNext(y: 660, headingH: 30, nextLineH: 18, bottom: bottom)) // heading + two body lines do not fit: next page
        XCTAssertFalse(keepHeadingWithNext(y: 400, headingH: 30, nextLineH: 18, bottom: bottom))
        XCTAssertEqual(pageLabel(3, 12), "3 / 12")
    }

    func testAHeadingOrATableWithoutABlankLineAroundItIsStillItsOwnBlock() {
        let heading = pdfBlocks("### Ngày 1\n- mục a\n- mục b")
        XCTAssertEqual(heading.count, 2)
        XCTAssertEqual(heading[0], PdfBlock(level: 3, text: "Ngày 1"))
        XCTAssertEqual(heading[1].level, 0)
        XCTAssertTrue(heading[1].text.contains("mục a") && heading[1].text.contains("mục b"), heading[1].text)

        let table = pdfBlocks("Bảng giá:\n| Mẫu | Giá |\n|---|---|\n| VF 3 | 240 |")
        XCTAssertEqual(table.count, 2)
        XCTAssertEqual(table[0].text, "Bảng giá:")
        XCTAssertEqual(table[1].rows, [["Mẫu", "Giá"], ["VF 3", "240"]])

        // a fenced block stays whole
        XCTAssertEqual(pdfBlocks("```\n# not a heading\n| a | b |\n```").count, 1)
    }

    func testHeadingLevelsAreOneToThreeAndDeeperHeadingsReadAsThree() {
        XCTAssertEqual(pdfBlocks("# Một").first?.level, 1)
        XCTAssertEqual(pdfBlocks("## Hai").first?.level, 2)
        XCTAssertEqual(pdfBlocks("##### Năm").first?.level, 3)
        XCTAssertEqual(pdfBlocks("Chữ thường").first?.level, 0)
    }

    func testATableThatCannotBeAGridOrARowThatCannotFitAPageIsDrawnAsText() {
        XCTAssertTrue(tableFitsGrid(cols: 3, width: 483, pad: 6))
        XCTAssertTrue(tableFitsGrid(cols: 8, width: 483, pad: 6))
        XCTAssertFalse(tableFitsGrid(cols: 41, width: 483, pad: 6))
        XCTAssertFalse(tableFitsGrid(cols: 0, width: 483, pad: 6))
        XCTAssertTrue(rowFitsPage(rowH: 300, bodyH: 700))
        XCTAssertTrue(rowFitsPage(rowH: 700, bodyH: 700))
        XCTAssertFalse(rowFitsPage(rowH: 701, bodyH: 700))
    }

    func testMarksAreReadAsTheReaderSeesThemAndAnUnderscoreInsideAWordStays() {
        XCTAssertEqual(pdfBlocks("Mã ABC_123 và XYZ_456 hết").first?.text, "Mã ABC_123 và XYZ_456 hết")
        XCTAssertEqual(pdfBlocks("vnexpress.net/tin_a_b").first?.text, "vnexpress.net/tin_a_b")
        XCTAssertEqual(pdfBlocks("_nghiêng_").first?.text, "nghiêng")
        XCTAssertEqual(pdfBlocks("*nghiêng*").first?.text, "nghiêng")
        XCTAssertEqual(pdfBlocks("5 * 3 * 2").first?.text, "5 * 3 * 2")
        XCTAssertEqual(pdfBlocks("Có **đậm** và `mã` đây").first?.text, "Có đậm và mã đây")
    }

    func testListsKeepTheirMarksAsLinesOfText() {
        XCTAssertEqual(pdfBlocks("- một\n- hai").first?.text, "• một\n• hai")
        XCTAssertEqual(pdfBlocks("1. một\n2. hai").first?.text, "1. một\n2. hai")
    }

    func testBlankLinesCutBlocksAndAnEmptyReportHasNone() {
        XCTAssertEqual(pdfBlocks("Một.\n\n\nHai.").map { $0.text }, ["Một.", "Hai."])
        XCTAssertTrue(pdfBlocks("").isEmpty)
        XCTAssertTrue(pdfBlocks("  \n\n ").isEmpty)
        XCTAssertEqual(pdfBlocks("Một.\r\n\r\nHai.").map { $0.text }, ["Một.", "Hai."])
    }
}
