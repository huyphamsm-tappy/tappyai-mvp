import XCTest
@testable import TappyAI

/// The finished Deep Research report as a file the person keeps - Markdown here (PDF and Word are a later round) - built on the phone
/// from what is on screen: the report text, the card's https sources and the charts' checked figures. Nothing is sent anywhere.
/// Port of the web's `reportExport.ts` / `reportChart.ts` (`chartTable`) and Android's `ReportExport.kt`
/// (`ReportExportTest`, `ReportLinksAndMarkTest`).
final class ReportExportTests: XCTestCase {

    private let links = [
        ResearchLink(id: 1, title: "VnExpress – Xe điện", url: "https://vnexpress.net/a"),
        ResearchLink(id: 2, title: "Nguồn [lạ]", url: "http://plain.example/"),
    ]
    private let report = "# Thị trường xe điện\n\n## 1. Doanh số\n\nBán 10 xe [1].\n\n## Nguồn\n\n1. VnExpress — vnexpress.net\n2. Plain — plain.example\n3. Không có — x"

    private func chart(section: String = "Doanh số") -> ResearchChart {
        ResearchChart(section: section, title: "Doanh số theo năm", unit: "xe", kind: .bar,
                      points: [ChartPoint(label: "2024", value: 1234.5, source: 1), ChartPoint(label: "2025", value: 2000, source: 2)])
    }

    // MARK: - File name

    func testTheFileNameKeepsLettersDigitsSpacesAndDashesAtMostSixtyCharacters() {
        XCTAssertEqual(reportFileName("Thị trường: xe điện / 2025?", "md"), "Thị trường xe điện 2025.md")
        XCTAssertEqual(reportFileName("***", "pdf"), "report.pdf")
        XCTAssertEqual(reportFileName("", "md"), "report.md")
        XCTAssertEqual(reportFileName("Kế hoạch - Đà Nẵng", "md"), "Kế hoạch - Đà Nẵng.md")
        XCTAssertEqual(reportFileName(String(repeating: "a", count: 100), "md").count, 60 + 3)
    }

    func testTheFileNameIsComposedNFC() {
        // "e" + combining circumflex + combining dot below is written as the one composed letter
        let decomposed = "Vie\u{0323}\u{0302}t"
        XCTAssertEqual(reportFileName(decomposed, "md").unicodeScalars.count, "Việt.md".precomposedStringWithCanonicalMapping.unicodeScalars.count)
        XCTAssertEqual(reportFileName(decomposed, "md"), "Việt.md".precomposedStringWithCanonicalMapping)
    }

    // MARK: - Markdown

    func testTheLastSectionsNumberedLinesLinkToTheCardsHttpsSourcesOfTheSameNumber() {
        let md = reportMarkdown(report, links)
        XCTAssertTrue(md.contains("1. [VnExpress – Xe điện](https://vnexpress.net/a)"), md)
        XCTAssertTrue(md.contains("2. Plain — plain.example"), "http is not linked: \(md)")
        XCTAssertTrue(md.contains("3. Không có — x"), md)
        XCTAssertTrue(md.contains("Bán 10 xe [1]."), "the body is as written")
        XCTAssertTrue(md.hasSuffix("\n"))
        XCTAssertFalse(md.hasSuffix("\n\n"))
    }

    func testNumberedLinesBeforeTheLastHeadingAreNotLinked() {
        let text = "# T\n\n1. Bước một\n\n## Nguồn\n\n1. A — a.example"
        let md = reportMarkdown(text, [ResearchLink(id: 1, title: "A", url: "https://a.example/x")])
        XCTAssertTrue(md.contains("\n1. Bước một\n"), md)
        XCTAssertTrue(md.contains("1. [A](https://a.example/x)"), md)
    }

    func testAnUnsafeAddressIsNeverLinked() {
        let unsafe = [ResearchLink(id: 1, title: "Nội bộ", url: "https://localhost/x"),
                      ResearchLink(id: 2, title: "Tài khoản", url: "https://user@a.example/x")]
        let md = reportMarkdown("# T\n\n## Nguồn\n\n1. Nội bộ — x\n2. Tài khoản — y", unsafe)
        XCTAssertFalse(md.contains("]("), md)
    }

    func testTheLabelLosesBracketsBackslashesAndLineBreaks() {
        let md = reportMarkdown("## Nguồn\n\n1. x", [ResearchLink(id: 1, title: "Một [hai]\\ ba\nbốn", url: "https://a.example/")])
        XCTAssertTrue(md.contains("1. [Một hai ba bốn](https://a.example/)"), md)
    }

    func testAnEmptyTitleFallsBackToTheLinesOwnText() {
        let md = reportMarkdown("## Nguồn\n\n1. Tên trên dòng — a.example", [ResearchLink(id: 1, title: " [] ", url: "https://a.example/")])
        XCTAssertTrue(md.contains("1. [Tên trên dòng — a.example](https://a.example/)"), md)
    }

    func testAnAddressWithBracketsIsWrittenWithPercentCodes() {
        let wiki = "https://vi.wikipedia.org/wiki/Hà_Nội_(thành_phố)"
        let md = reportMarkdown("# T\n\ntext\n\n## Nguồn\n\n1. Hà Nội — vi.wikipedia.org\n", [ResearchLink(id: 1, title: "Hà Nội", url: wiki)])
        XCTAssertTrue(md.contains("(https://vi.wikipedia.org/wiki/Hà_Nội_%28thành_phố%29)"), md)
    }

    func testWindowsLineEndingsBecomeNewlines() {
        let md = reportMarkdown("# T\r\n\r\ntext\r\n", [])
        XCTAssertEqual(md, "# T\n\ntext\n")
    }

    // MARK: - Figures

    func testFormatValueFollowsTheReportsLanguageWithAtMostTwoDecimals() {
        XCTAssertEqual(formatValue(1234.5, "vi"), "1.234,5")
        XCTAssertEqual(formatValue(1234.5, "en"), "1,234.5")
        XCTAssertEqual(formatValue(2000, "vi"), "2.000")
        XCTAssertEqual(formatValue(0.126, "en"), "0.13")
        XCTAssertEqual(formatValue(98, "en"), "98")
        XCTAssertEqual(formatValue(-5.5, "vi"), "-5,5")
    }

    func testTheChartTableKeepsEachFiguresSourceAndAnyUnknownLanguageIsEnglish() {
        let vi = chartTable(chart(), "vi")
        XCTAssertEqual(vi, "| Mục | Giá trị |\n|---|---|\n| 2024 | 1.234,5 xe [1] |\n| 2025 | 2.000 xe [2] |\n\n*Biểu đồ: Doanh số theo năm*")
        let en = chartTable(chart(), "en")
        XCTAssertTrue(en.hasPrefix("| Item | Value |"), en)
        XCTAssertTrue(en.contains("| 2024 | 1,234.5 xe [1] |"), en)
        XCTAssertTrue(en.hasSuffix("*Chart: Doanh số theo năm*"), en)
    }

    func testTheChartTableHasNoUnitSpaceWithoutAUnitAndNoPipesInCells() {
        let c = ResearchChart(section: "S", title: "A|B", unit: "", kind: .line,
                              points: [ChartPoint(label: "x|y", value: 3, source: 4), ChartPoint(label: "z", value: 5, source: 6)])
        let t = chartTable(c, "en")
        XCTAssertTrue(t.contains("| x/y | 3 [4] |"), t)
        XCTAssertTrue(t.hasSuffix("*Chart: A/B*"), t)
    }

    // MARK: - Charts under their sections

    func testEachChartBecomesATableRightUnderItsSectionHeading() {
        let vi = withChartTables(report, [chart()], "vi")
        XCTAssertTrue(vi.contains("## 1. Doanh số\n\n| Mục | Giá trị |\n|---|---|\n| 2024 | 1.234,5 xe [1] |\n| 2025 | 2.000 xe [2] |\n\n*Biểu đồ: Doanh số theo năm*\n"), vi)
        let en = withChartTables(report, [chart()], "en")
        XCTAssertTrue(en.contains("| Item | Value |") && en.contains("| 2024 | 1,234.5 xe [1] |"), en)
    }

    func testAChartWhoseHeadingIsNotThereIsLeftOut() {
        XCTAssertEqual(withChartTables(report, [chart(section: "Không có mục này")], "vi"), report)
        XCTAssertEqual(withChartTables(report, [], "vi"), report)
    }

    func testTheHeadingMatchesWithoutAccentsNumberCaseOrPunctuation() {
        let text = "## 2) DOANH SO: theo năm\n\nnội dung"
        let out = withChartTables(text, [chart(section: "doanh số")], "en")
        XCTAssertTrue(out.hasPrefix("## 2) DOANH SO: theo năm\n\n| Item | Value |"), out)
    }

    func testAChartIsPlacedOnceAndATitleLevelHeadingIsNotASection() {
        let text = "# Doanh số\n\n## Doanh số\n\na\n\n## Doanh số\n\nb"
        let out = withChartTables(text, [chart()], "en")
        XCTAssertEqual(out.components(separatedBy: "| Item | Value |").count - 1, 1, out)
        XCTAssertFalse(out.hasPrefix("# Doanh số\n\n|"), "a level-1 title takes no chart")
    }

    // MARK: - Title helpers

    func testTitleKeyIgnoresAccentsDCaseAndPunctuation() {
        XCTAssertEqual(answerTitleKey("Đà Nẵng: 3 ngày!"), "da nang 3 ngay")
        XCTAssertEqual(answerTitleKey("  Doanh   số "), "doanh so")
        XCTAssertEqual(answerTitleKey("***"), "")
    }

    func testCleanTitleDropsNumberSymbolBoldAndTheTailAfterASeparator() {
        XCTAssertEqual(answerCleanTitle("1. Doanh số"), "Doanh số")
        XCTAssertEqual(answerCleanTitle("🚗 **Giá xe** - theo hãng"), "Giá xe")
        XCTAssertEqual(answerCleanTitle("Giá: theo năm"), "Giá")
        XCTAssertEqual(answerCleanTitle("Giá xe (VND)"), "Giá xe")
        XCTAssertEqual(answerCleanTitle("Kết luận:"), "Kết luận")
    }
}
