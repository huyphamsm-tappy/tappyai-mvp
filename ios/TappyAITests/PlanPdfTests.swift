import XCTest
@testable import TappyAI

/// The plan as a PDF file (web `planMarkdown.ts` + `downloadPlanPdf`, owner 19/11): the plan's own text through the report's A4 writer.
final class PlanPdfTests: XCTestCase {

    private let json = #"""
    {"type":"trip","title":"Quy Nhơn 3 ngày","people":3,"budget_total":"6.000.000đ",
     "days":[{"label":"Ngày 1","items":[{"time":"09:00","name":"Bãi Kỳ Co","description":"Tắm   biển","price":"50.000đ","address":"Nhơn Lý"},
                                       {"time":"12:00","name":"Quán A | B"}]},
             {"label":"Ngày 2","items":[{"time":"08:00","name":"Eo Gió"}]}],
     "cost_breakdown":{"Ăn uống":"1.500.000đ","Đi lại":"800.000đ"},
     "local_tips":[{"text":"Đi sớm tránh nắng","basis":"general"}],
     "stays":[{"name":"Seaside Hotel","why":"Gần biển","price":"1.200.000đ/đêm"}],
     "dishes":[{"dish":"Bánh xèo","venue":"Quán Bà Hai","note":"Giòn"}]}
    """#

    private func plan() throws -> TappyPlan { try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8)) }

    private let labels = PlanMarkdown.Labels(facts: "2 days · 3 stops", budget: "Budget", item: "Item", cost: "Cost", tips: "Tips", total: "Total",
                                             stays: "Where to stay", dishes: "What to try")

    func testTheMarkdownHasTheSectionsInTheWebsOrder() throws {
        let md = PlanMarkdown.build(try plan(), labels: labels)
        let order = ["# Quy Nhơn 3 ngày", "2 days · 3 stops", "## Ngày 1", "## Ngày 2", "## Where to stay", "## What to try", "## Budget", "## Tips"]
        var from = md.startIndex
        for marker in order {
            let r = try XCTUnwrap(md.range(of: marker, range: from..<md.endIndex), "\(marker) missing or out of order")
            from = r.upperBound
        }
    }

    func testEachStopIsOneLineWithOnlyWhatThePlanStates() throws {
        let md = PlanMarkdown.build(try plan(), labels: labels)
        XCTAssertTrue(md.contains("- **09:00 - Bãi Kỳ Co** - Tắm biển 50.000đ Nhơn Lý"), "whitespace collapsed, description then price then address")
        XCTAssertTrue(md.contains("- **12:00 - Quán A / B**"), "a pipe would cut a table cell: it becomes a slash")
        XCTAssertTrue(md.contains("- **Seaside Hotel** - Gần biển 1.200.000đ/đêm"))
        XCTAssertTrue(md.contains("- **Bánh xèo** - Quán Bà Hai Giòn"))
    }

    func testTheBudgetTableHoldsThePlansOwnLinesAndItsOwnTotal() throws {
        let md = PlanMarkdown.build(try plan(), labels: labels)
        XCTAssertTrue(md.contains("| Item | Cost |\n| --- | --- |\n| Ăn uống | 1.500.000đ |\n| Đi lại | 800.000đ |\n| Total | 6.000.000đ |"), md)
    }

    func testASectionWithNothingInItIsNotWritten() throws {
        let bare = try ResponseDecoder.json.decode(TappyPlan.self, from: Data(#"{"title":"T","days":[{"label":"Ngày 1","items":[{"name":"A"}]}]}"#.utf8))
        let md = PlanMarkdown.build(bare, labels: labels)
        for heading in ["## Where to stay", "## What to try", "## Budget", "## Tips"] { XCTAssertFalse(md.contains(heading), heading) }
        let noHeadings = PlanMarkdown.build(try plan(), labels: PlanMarkdown.Labels(facts: "", budget: "B", item: "I", cost: "C", tips: "T", total: "Σ"))
        XCTAssertFalse(noHeadings.contains("Seaside"), "without the headings the stays and dishes are not written, like the web")
    }

    func testTheFactsLineCountsThePlanNotAnEstimate() throws {
        let line = PlanMarkdown.facts(try plan(), days: { "\($0)d" }, stops: { "\($0)s" }, people: { "\($0)p" })
        XCTAssertEqual(line, "2d · 3s · 3p · 6.000.000đ")
    }

    func testThePdfIsARealPdf() throws {
        let p = try plan()
        let data = PlanPdf.data(for: p, labels: labels)
        XCTAssertGreaterThan(data.count, 500)
        XCTAssertEqual(String(decoding: data.prefix(5), as: UTF8.self), "%PDF-")
    }

    func testTheFileNameComesFromTheTitle() throws {
        XCTAssertEqual(PlanPdf.fileName(for: try plan()), "Quy Nhơn 3 ngày.pdf")
    }

    func testEveryStringTheButtonAndTheFileUseHasACatalogEntry() {
        for key in ["chat.plan.pdf", "chat.plan.pdfBudget", "chat.plan.pdfItem", "chat.plan.pdfCost", "chat.plan.pdfTotal", "chat.plan.pdfTips",
                    "chat.plan.pdfDays", "chat.plan.pdfStops", "chat.plan.pdfPeople"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
