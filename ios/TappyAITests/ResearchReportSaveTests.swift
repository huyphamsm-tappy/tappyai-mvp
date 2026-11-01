import XCTest
import UniformTypeIdentifiers
@testable import TappyAI

/// Keeping the finished report as a Markdown file (web `reportExport.ts`, Android `ResearchCard.kt` `saveReport`): what goes in the file, what
/// it is called, the document the system's save dialog writes, and what the person is told afterwards. Nothing is sent anywhere.
final class ResearchReportSaveTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    private func catalog() throws -> [String: Any] {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("TappyAI/Resources/Localizable.xcstrings"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(json["strings"] as? [String: Any])
    }

    private func value(_ key: String, _ lang: String, in strings: [String: Any]) -> String? {
        let entry = strings[key] as? [String: Any]
        let loc = (entry?["localizations"] as? [String: Any])?[lang] as? [String: Any]
        return (loc?["stringUnit"] as? [String: Any])?["value"] as? String
    }

    private let report = "# Xe điện\n\n## Doanh số\n\nBán 10 xe [1].\n\n## Nguồn\n\n1. VnExpress — vnexpress.net"
    private let links = [ResearchLink(id: 1, title: "VnExpress", url: "https://vnexpress.net/a")]
    private let charts = [ResearchChart(section: "Doanh số", title: "Theo năm", unit: "xe", kind: .bar,
                                        points: [ChartPoint(label: "2024", value: 10, source: 1), ChartPoint(label: "2025", value: 20, source: 1)])]

    // MARK: - The file

    func testTheFileIsTheReportWithItsChartTablesAndLinkedSources() {
        let md = ResearchReportFile.markdown(report: report, charts: charts, links: links, lang: "vi")
        XCTAssertEqual(md, reportMarkdown(withChartTables(report, charts, "vi"), links))
        XCTAssertTrue(md.contains("## Doanh số\n\n| Mục | Giá trị |"), md)
        XCTAssertTrue(md.contains("1. [VnExpress](https://vnexpress.net/a)"), md)
    }

    func testTheNameComesFromTheCardsTitleAndFallsBackToReport() {
        XCTAssertEqual(ResearchReportFile.fileName(title: "Xe điện: thị trường 2025", format: .markdown), "Xe điện thị trường 2025.md")
        XCTAssertEqual(ResearchReportFile.fileName(title: "  ", format: .markdown), "report.md")
    }

    func testTheMarkdownFormatIsCalledMarkdown() {
        XCTAssertEqual(ResearchExportFormat.markdown.label, "Markdown")
        XCTAssertEqual(ResearchExportFormat.markdown.fileExtension, "md")
    }

    // MARK: - The document

    func testTheDocumentWritesTheTextAsUTF8AndTheTypeIsMarkdown() throws {
        let doc = MarkdownReportDocument(text: "# Tiêu đề\n")
        XCTAssertEqual(Data(doc.text.utf8), Data("# Tiêu đề\n".utf8))
        XCTAssertTrue(MarkdownReportDocument.writableContentTypes.contains(MarkdownReportDocument.markdownType))
        XCTAssertEqual(MarkdownReportDocument.markdownType.preferredFilenameExtension ?? "md", "md")
    }

    // MARK: - What the person is told

    func testSavedAndFailedAreToldAndACancelIsNot() {
        XCTAssertEqual(ResearchReportFile.notice(for: .success(URL(fileURLWithPath: "/tmp/x.md"))), .saved)
        XCTAssertEqual(ResearchReportFile.notice(for: .failure(CocoaError(.fileWriteNoPermission))), .failed)
        XCTAssertEqual(ResearchReportFile.notice(for: .failure(URLError(.cannotWriteToFile))), .failed)
        XCTAssertNil(ResearchReportFile.notice(for: .failure(CocoaError(.userCancelled))), "choosing Cancel is not a failure")
    }

    func testEachNoticeHasItsWordsInBothLanguages() throws {
        XCTAssertEqual(ReportSaveNotice.saved.key, "chat.research.saved")
        XCTAssertEqual(ReportSaveNotice.failed.key, "chat.research.saveFailed")
        let strings = try catalog()
        for key in ["chat.research.saved", "chat.research.saveFailed", "chat.research.download"] {
            for lang in ["vi", "en"] {
                XCTAssertFalse((value(key, lang, in: strings) ?? "").isEmpty, "\(key) \(lang)")
            }
        }
        XCTAssertEqual(value("chat.research.saved", "vi", in: strings), "Đã lưu báo cáo")
        XCTAssertEqual(value("chat.research.saveFailed", "vi", in: strings), "Không lưu được báo cáo. Hãy thử lại hoặc chọn nơi lưu khác.")
        XCTAssertEqual(value("chat.research.saved", "en", in: strings), "Report saved")
        XCTAssertEqual(value("chat.research.download", "vi", in: strings), "Tải báo cáo:")
    }

    // MARK: - Where it is wired

    func testTheCardOffersTheSaveOnlyThroughTheSystemsSaveDialog() throws {
        let card = try source("TappyAI/Features/Chat/UI/ResearchCardView.swift")
        XCTAssertTrue(card.contains(".fileExporter("))
        XCTAssertTrue(card.contains("ResearchCardModel.offersDownload("))
        XCTAssertTrue(card.contains("ResearchReportFile.notice("))
        let list = try source("TappyAI/Features/Chat/UI/ChatMessageList.swift")
        XCTAssertTrue(list.contains("report: isStreaming ? nil : content"), "the card is given the reply's finished text, never anything else")
    }
}
