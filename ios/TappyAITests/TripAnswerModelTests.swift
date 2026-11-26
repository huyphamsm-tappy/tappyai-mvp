import XCTest
@testable import TappyAI

/// Step 1 of the layout rework (owner mockups 26/11). RULE NUMBER ONE: only what the data has. These pin what the overview card, the stop rows
/// and the dish lines say, from plans written the way the server writes them (the Hà Giang answers of the owner's UAT).
final class TripAnswerModelTests: XCTestCase {

    private func plan(_ json: String) throws -> TappyPlan {
        try JSONDecoder().decode(TappyPlan.self, from: Data(json.utf8))
    }

    private func overview(_ json: String) throws -> TripOverviewModel.Overview {
        let p = try plan(json)
        return TripOverviewModel.of(p, card: PlanCardModel.of(p))
    }

    // MARK: Overview

    func testAShortBudgetIsAChipAndAnExplanationIsTheParagraph() throws {
        let short = try overview(#"{"type":"trip","title":"Hà Giang","people":2,"budget_total":"~4.200.000đ","days":[{"label":"Ngày 1","items":[{"name":"A"}]}]}"#)
        XCTAssertEqual(short.chips.map(\.kind), [.budget, .duration, .people])
        XCTAssertEqual(short.chips.first?.value, "~4.200.000đ")
        XCTAssertNil(short.paragraph)

        let sentence = "Chưa chốt được tổng: nguồn lưu trú trả tên khách sạn nhưng không có giá theo đêm; vé xe tham khảo 300.000–550.000đ/người/lượt."
        let long = try overview(#"{"type":"trip","title":"Hà Giang","budget_total":"\#(sentence)","days":[{"label":"Ngày 1","items":[{"name":"A"}]}]}"#)
        XCTAssertFalse(long.chips.contains { $0.kind == .budget }, "a sentence is not a chip")
        XCTAssertEqual(long.paragraph, sentence, "the server's sentence, character for character")
        XCTAssertTrue(long.rows.contains { $0.labelKey == "chat.planV2.budget" && $0.value == sentence })
    }

    func testTheDaysAndNightsAreWorkedOutFromTheDaysOfATrip() throws {
        let three = try overview(#"{"type":"trip","title":"T","days":[{"label":"Ngày 1","items":[{"name":"a"}]},{"label":"Ngày 2","items":[{"name":"b"}]},{"label":"Ngày 3","items":[{"name":"c"}]}]}"#)
        // The words come from the catalogue (the test must not depend on the simulator's language).
        XCTAssertEqual(three.chips.first { $0.kind == .duration }?.value, String(format: NSLocalizedString("trip.duration.daysNights", comment: ""), 3, 2))
        let one = try overview(#"{"type":"trip","title":"T","days":[{"label":"Ngày 1","items":[{"name":"a"}]}]}"#)
        XCTAssertEqual(one.chips.first { $0.kind == .duration }?.value, String(format: NSLocalizedString("trip.duration.oneDay", comment: ""), 1))
    }

    func testTheServersOwnDurationWinsOverTheOneWorkedOut() throws {
        let o = try overview(#"{"type":"trip","title":"T","duration":"3 ngày · 2 đêm","days":[{"label":"Ngày 1","items":[{"name":"a"}]}]}"#)
        XCTAssertEqual(o.chips.first { $0.kind == .duration }?.value, "3 ngày · 2 đêm")
    }

    func testAnEveningHasNoInventedNights() throws {
        let o = try overview(#"{"type":"evening","domain":"food","title":"Tối nay","days":[{"label":"Tối nay","items":[{"name":"a"}]}]}"#)
        XCTAssertNil(o.chips.first { $0.kind == .duration }, "an evening is not «1 ngày»")
    }

    func testPeopleComeFromTheCountOrElseFromTheParty() throws {
        let counted = try overview(#"{"type":"trip","title":"T","people":2,"days":[{"label":"Ngày 1","items":[{"name":"a"}]}]}"#)
        XCTAssertEqual(counted.chips.first { $0.kind == .people }?.value, String(format: NSLocalizedString("chat.planV2.people", comment: ""), 2))
        let party = try overview(#"{"type":"trip","title":"T","traveler":{"party":"2 người lớn và 1 bé"},"days":[{"label":"Ngày 1","items":[{"name":"a"}]}]}"#)
        XCTAssertEqual(party.chips.first { $0.kind == .people }?.value, "2 người lớn và 1 bé")
    }

    func testNothingIsDrawnForAFieldThePlanDoesNotHave() throws {
        let o = try overview(#"{"type":"trip","title":"T","days":[{"label":"Ngày 1","items":[{"name":"a"}]}]}"#)
        XCTAssertFalse(o.chips.contains { $0.kind == .budget })
        XCTAssertFalse(o.chips.contains { $0.kind == .people })
        XCTAssertNil(o.paragraph)
        XCTAssertTrue(o.costs.isEmpty)
        XCTAssertTrue(o.assumptions.isEmpty)
        XCTAssertFalse(o.rows.contains { $0.labelKey == "trip.travelerPace" })
    }

    func testTheSheetCarriesTheCostLinesAndTheAssumptions() throws {
        let o = try overview(#"{"type":"trip","title":"T","days":[{"label":"Ngày 1","items":[{"name":"a"}]}],"cost_breakdown":{"Ăn uống":"1.800.000đ"},"assumptions":["Đi vào cuối tuần"]}"#)
        XCTAssertEqual(o.costs.map(\.key), ["Ăn uống"])
        XCTAssertEqual(o.costs.map(\.value), ["1.800.000đ"])
        XCTAssertEqual(o.assumptions, ["Đi vào cuối tuần"])
    }

    // MARK: Stops

    func testAStopKeepsTheCategoryTheServerWrote() throws {
        let p = try plan(#"{"type":"trip","title":"T","days":[{"label":"Ngày 1","items":[{"name":"Ăn trưa","category":"food","time":"12:30"}]}]}"#)
        XCTAssertEqual(PlanCardModel.of(p).days.first?.stops.first?.category, "food")
    }

    func testAStopWithoutAPictureGetsASmallSymbolOfItsCategory() {
        XCTAssertEqual(TripStopIcon.symbol(category: "hotel"), "bed.double.fill")
        XCTAssertEqual(TripStopIcon.symbol(category: "food"), "fork.knife")
        XCTAssertEqual(TripStopIcon.symbol(category: "Di chuyển"), "car.fill")
        XCTAssertEqual(TripStopIcon.symbol(category: ""), "mappin.circle.fill", "no category, no guess: a pin")
        XCTAssertEqual(TripStopIcon.symbol(category: "something unknown"), "mappin.circle.fill")
    }

    // MARK: Dishes

    func testADishLineIsVenueAndNoteOrWhicheverTheServerGave() {
        XCTAssertEqual(TripDishLine.text(venue: "Quán A", note: "Món nóng"), "Quán A · Món nóng")
        XCTAssertEqual(TripDishLine.text(venue: "Quán A", note: nil), "Quán A")
        XCTAssertEqual(TripDishLine.text(venue: nil, note: "Món nóng"), "Món nóng")
        XCTAssertNil(TripDishLine.text(venue: nil, note: nil))
    }
}
