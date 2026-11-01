import XCTest
@testable import TappyAI

/// The report's charts (web `ResearchChart` / `reportChart.ts`, Android `ResearchChartView`): the heading a chart carries and the one-sentence
/// summary VoiceOver reads in place of the drawing. The figures are the server's checked ones, written the way the report's language writes them.
final class ResearchChartModelTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    private func chart(unit: String = "triệu", kind: ResearchChartKind = .bar) -> ResearchChart {
        ResearchChart(section: "Giá", title: "Giá vàng", unit: unit, kind: kind,
                      points: [ChartPoint(label: "2024", value: 76.5, source: 1), ChartPoint(label: "2025", value: 1234.567, source: 2)])
    }

    func testTheHeadingIsTheTitleWithItsUnitInBrackets() {
        XCTAssertEqual(ResearchChartModel.heading(chart()), "Giá vàng (triệu)")
        XCTAssertEqual(ResearchChartModel.heading(chart(unit: "")), "Giá vàng")
        XCTAssertEqual(ResearchChartModel.heading(chart(unit: "   ")), "Giá vàng")
    }

    func testTheSummaryReadsEveryFigureInTheReportsLanguage() {
        XCTAssertEqual(ResearchChartModel.summary(chart(), "vi"), "Biểu đồ: Giá vàng (triệu). 2024: 76,5; 2025: 1.234,57")
        XCTAssertEqual(ResearchChartModel.summary(chart(kind: .line), "en"), "Chart: Giá vàng (triệu). 2024: 76.5; 2025: 1,234.57")
    }

    func testTheChartIsDrawnWithSwiftChartsFromTheFiguresAndTheLanguage() throws {
        let view = try source("TappyAI/Features/Chat/UI/ResearchChartView.swift")
        XCTAssertTrue(view.contains("import Charts"))
        XCTAssertTrue(view.contains("BarMark("))
        XCTAssertTrue(view.contains("LineMark("))
        XCTAssertTrue(view.contains("formatValue("), "the numbers are written by formatValue")
        XCTAssertTrue(view.contains("ResearchChartModel.summary("), "VoiceOver reads the figures")
    }

    func testTheChartsAreDrawnUnderTheReportLiveAndOnTheReply() throws {
        let list = try source("TappyAI/Features/Chat/UI/ChatMessageList.swift")
        XCTAssertTrue(list.contains("ResearchChartView("))
        XCTAssertTrue(list.contains("liveCharts"))
        let view = try source("TappyAI/Features/Chat/UI/ChatView.swift")
        XCTAssertTrue(view.contains("liveCharts: vm.liveCharts"))
    }
}
