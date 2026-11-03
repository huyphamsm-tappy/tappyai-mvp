import XCTest
@testable import TappyAI

/// Review 02/11 (iOS = the web's TripPlanCard and Android `CostLines`): the cost block shows the server's total ("Tổng ước tính") above
/// its lines, never a sum made on the device, and the plan card prints no "no price" sentence under a stop without a price.
final class PlanCostTotalTests: XCTestCase {
    private func plan(_ json: String) throws -> TappyPlan {
        try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8))
    }

    func testTheTotalIsTheServersBudgetAndNothingElse() throws {
        let p = try plan(#"{"title":"x","budget_total":"5.000.000đ","cost_breakdown":{"Ăn":"1.000.000đ","Ở":"2.000.000đ"},"days":[]}"#)
        XCTAssertEqual(PlanCardModel.costTotal(p), "5.000.000đ", "the server's figure, not 1.000.000 + 2.000.000")
    }

    func testNoTotalWhenTheServerGaveNoAmount() throws {
        XCTAssertNil(PlanCardModel.costTotal(try plan(#"{"title":"x","budget_total":"chưa có giá","days":[]}"#)))
        XCTAssertNil(PlanCardModel.costTotal(try plan(#"{"title":"x","days":[]}"#)))
    }

    func testThePlanCardSourceHasNoNoPriceSentenceAndShowsTheTotalLabel() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("TappyAI/Features/Chat/UI/PlanCardView.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("chat.planV2.noPrice"), "the «chưa có giá — hỏi quán» line is gone")
        XCTAssertTrue(source.contains("chat.plan.totalEstimate"), "the cost block shows the total")
    }
}
