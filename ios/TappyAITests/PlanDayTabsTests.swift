import XCTest
@testable import TappyAI

/// Review 02/11 (iOS = the web's TripPlanCard and Android `PlanDayTabsTest`): the plan card is split into day tabs and draws ONE day,
/// not every day stacked; the chosen tab stays inside the days the card has, and a day's badge is the number its label names.
final class PlanDayTabsTests: XCTestCase {

    private func card(_ json: String) throws -> PlanCardModel {
        PlanCardModel.of(try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8)))
    }

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    func testTheChosenTabStaysInsideTheDaysTheCardHas() {
        XCTAssertEqual(dayTabIndex(0, dayCount: 3), 0)
        XCTAssertEqual(dayTabIndex(2, dayCount: 3), 2)
        XCTAssertEqual(dayTabIndex(7, dayCount: 3), 2, "the plan shrank after a new answer")
        XCTAssertEqual(dayTabIndex(-1, dayCount: 3), 0)
        XCTAssertEqual(dayTabIndex(4, dayCount: 0), 0, "no days at all")
    }

    func testTheDayNumberIsTheOneTheLabelNames() {
        XCTAssertEqual(dayNumberOf("Ngày 3 — Hội An"), 3)
        XCTAssertEqual(dayNumberOf("  ngay 12"), 12)
        XCTAssertEqual(dayNumberOf("Day 2: beach"), 2)
        XCTAssertEqual(dayNumberOf("Ngày 1 - Thứ Sáu 26/9"), 1)
        XCTAssertNil(dayNumberOf("Buổi tối"))
        XCTAssertNil(dayNumberOf(""))
        XCTAssertNil(dayNumberOf("Hôm nay (18/9)"), "a date is not a day number")
    }

    func testTheDayBadgeFollowsTheLabelNotThePosition() throws {
        let json = #"{"type":"trip","title":"T","days":[{"label":"Ngày 1 — A","items":[{"time":"09:00","name":"Một"}]},{"label":"Ngày 3 — C","items":[{"time":"09:00","name":"Ba"}]},{"label":"Buổi tối","items":[{"time":"20:00","name":"Tối"}]}]}"#
        let days = try card(json).days
        XCTAssertEqual(days.map(\.number), [1, 3, 3], "«Buổi tối» names no number: it follows the previous day")
        XCTAssertEqual(days.map(\.index), [0, 1, 2], "a tab is picked by its position, which is unique")
        XCTAssertEqual(Set(days.map(\.id)).count, 3)
    }

    func testALabelWithNoNumberFirstStartsAtItsPosition() throws {
        let days = try card(#"{"title":"T","days":[{"label":"Tối nay","items":[{"name":"A"}]}]}"#).days
        XCTAssertEqual(days.map(\.number), [1])
    }

    func testTheCardDrawsDayTabsAndOneDayNotEveryDayStacked() throws {
        let ui = try source("TappyAI/Features/Chat/UI/PlanCardView.swift")
        XCTAssertTrue(ui.contains("dayTabs("))
        XCTAssertTrue(ui.contains("dayTabIndex("))
        XCTAssertFalse(ui.contains("ForEach(m.days)"), "no stacking of every day")
    }
}
