import XCTest
@testable import TappyAI

/// Review 02/11 (iOS = the web's TripPlanCard and Android `CostLines`): the cost block keeps the order the SERVER wrote its lines in (it was
/// sorted A-Z), and a line whose value is a number is kept (as text) instead of the whole block disappearing.
final class PlanCostLinesTests: XCTestCase {

    private func plan(costs: String) throws -> TappyPlan {
        let reply = #"Lịch đây. [TAPPY_PLAN]{"title":"x","days":[{"label":"Ngày 1","items":[{"name":"A"}]}],"cost_breakdown":"# + costs + #"}[/TAPPY_PLAN]"#
        return try XCTUnwrap(ContentParser.parse(reply).plan)
    }

    private func pairs(_ p: TappyPlan) -> [String] { (p.costBreakdown ?? []).map { "\($0.key)=\($0.value)" } }

    func testTheLinesKeepTheOrderTheServerWroteThem() throws {
        let p = try plan(costs: #"{"Khách sạn":"1.000.000đ","Ăn uống":"800.000đ","Di chuyển":"300.000đ","Vé tham quan":"150.000đ"}"#)
        XCTAssertEqual(pairs(p), ["Khách sạn=1.000.000đ", "Ăn uống=800.000đ", "Di chuyển=300.000đ", "Vé tham quan=150.000đ"],
                       "written order, not A-Z")
    }

    func testANumericValueIsKeptAsTextAndTheBlockSurvives() throws {
        let p = try plan(costs: #"{"Ăn uống":1800000,"Ở":"2.000.000đ","Xe":350000.5}"#)
        XCTAssertEqual(pairs(p), ["Ăn uống=1800000", "Ở=2.000.000đ", "Xe=350000.5"])
    }

    func testANoPriceSentinelIsDroppedAndTheRestKeepsItsOrder() throws {
        let p = try plan(costs: #"{"Z đầu":"100đ","Khách sạn":"chưa có giá","A cuối":"200đ"}"#)
        XCTAssertEqual(pairs(p), ["Z đầu=100đ", "A cuối=200đ"])
    }

    func testNoCostBlockOrAnEmptyOneIsNil() throws {
        XCTAssertNil(try plan(costs: "{}").costBreakdown)
        let reply = #"x [TAPPY_PLAN]{"title":"x","days":[{"label":"d","items":[{"name":"A"}]}]}[/TAPPY_PLAN]"#
        XCTAssertNil(try XCTUnwrap(ContentParser.parse(reply).plan).costBreakdown)
    }

    // MARK: the key-order scanner

    func testKeyOrderOfTheNamedTopLevelObject() {
        let json = #"{"a":1,"cost_breakdown":{"b":"1","a":{"x":[1,{"y":2}]},"c":"}"},"z":{"cost_breakdown":{"no":1}}}"#
        XCTAssertEqual(JSONKeyOrder.keys(ofTopLevel: "cost_breakdown", in: json), ["b", "a", "c"])
    }

    func testKeyOrderReadsEscapesAndBracesInsideStrings() {
        let json = #"{"cost_breakdown":{"Ăn \"tối\"":"{1}","Véé":"2","tab\there":"3"}}"#
        XCTAssertEqual(JSONKeyOrder.keys(ofTopLevel: "cost_breakdown", in: json), ["Ăn \"tối\"", "Vé\u{e9}", "tab\there"])
    }

    func testKeyOrderIsEmptyWhenTheKeyIsAbsentOrNotAnObject() {
        XCTAssertEqual(JSONKeyOrder.keys(ofTopLevel: "cost_breakdown", in: #"{"title":"x"}"#), [])
        XCTAssertEqual(JSONKeyOrder.keys(ofTopLevel: "cost_breakdown", in: #"{"cost_breakdown":["a","b"]}"#), [])
        XCTAssertEqual(JSONKeyOrder.keys(ofTopLevel: "cost_breakdown", in: #"{"cost_breakdown":"text"}"#), [])
        XCTAssertEqual(JSONKeyOrder.keys(ofTopLevel: "cost_breakdown", in: ""), [])
        XCTAssertEqual(JSONKeyOrder.keys(ofTopLevel: "cost_breakdown", in: #"{"cost_breakdown":{"a":"#), [],
                       "a broken tail yields no keys rather than a crash")
    }

    func testTheCardDrawsTheLinesInTheirOrderNotSorted() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let ui = try String(contentsOf: root.appendingPathComponent("TappyAI/Features/Chat/UI/PlanCardView.swift"), encoding: .utf8)
        XCTAssertFalse(ui.contains("keys.sorted()"))
    }
}
