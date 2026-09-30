import XCTest
@testable import TappyAI

/// Plan card v2 (owner 29/09) — the SAME cases as Android `PlanCardV2Test`, fed the SAME fixtures
/// (`android/app/src/test/resources/plan-card/*.txt`: the Quy Nhơn sample and a food «tối nay»), so both apps are
/// held to one card from one block.
final class PlanCardV2Tests: XCTestCase {

    private static let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()   // …/ios/TappyAITests → repo root

    private func fixture(_ name: String) throws -> String {
        let url = Self.repoRoot.appendingPathComponent("android/app/src/test/resources/plan-card/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func plan(fromReply reply: String, file: StaticString = #filePath, line: UInt = #line) throws -> TappyPlan {
        try XCTUnwrap(ContentParser.parse(reply).plan, "the reply carries a [TAPPY_PLAN] block", file: file, line: line)
    }

    private func plan(json: String) throws -> TappyPlan {
        try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8))
    }

    private func quyNhon() throws -> PlanCardModel { PlanCardModel.of(try plan(fromReply: fixture("quy-nhon-v2.txt"))) }
    private func food() throws -> PlanCardModel { PlanCardModel.of(try plan(fromReply: fixture("food-evening-v2.txt"))) }

    func testQuyNhonSampleHeroMetaAndThreeStackedDays() throws {
        let card = try quyNhon()
        XCTAssertEqual(card.area, .travel)
        XCTAssertEqual(card.heroKey, "du-lich-bien-1")
        XCTAssertEqual(card.title, "Quy Nhơn 3 ngày 2 đêm")
        XCTAssertEqual(card.destination, "Quy Nhơn, Bình Định")
        XCTAssertEqual(card.duration, "3 ngày · 2 đêm")
        XCTAssertEqual(card.people, 2)
        XCTAssertEqual(card.days.map { $0.stops.count }, [4, 3, 2])
        XCTAssertEqual(card.days.map(\.title), ["Khám phá thành phố biển", "Thiên nhiên và văn hóa", "Thư giãn và mua sắm"])
        let first = try XCTUnwrap(card.days.first?.stops.first)
        XCTAssertEqual(first.time, "09:00")
        XCTAssertEqual(first.imageKey, "diem-bien")
        XCTAssertEqual(first.name, "Bãi Kỳ Co")
        XCTAssertEqual(first.address, "Xã Nhơn Lý, Quy Nhơn")
    }

    func testMoneyIsOnlyTheServersAmountsAndAMissingPriceReadsExactly() throws {
        let card = try quyNhon()
        let prices = Dictionary(card.days.flatMap(\.stops).map { ($0.name, $0.price) }, uniquingKeysWith: { _, last in last })
        XCTAssertEqual(prices["Hải sản Nhơn Lý"], "300.000đ/người")
        XCTAssertEqual(prices["Tháp Đôi"], "Miễn phí")
        XCTAssertEqual(prices["Eo Gió"], PlanCardModel.noPrice, "the model's «chưa có giá» sentinel never sits in a price slot")
        XCTAssertEqual(prices["Bãi Kỳ Co"], PlanCardModel.noPrice, "no price at all")
        XCTAssertEqual(PlanCardModel.noPrice, "chưa có giá — hỏi quán")
        // The overview budget is the server's total and ITS per-person line — nothing divided here.
        let budget = try XCTUnwrap(card.overview.first { $0.kind == .budget })
        XCTAssertEqual(budget.value, "5.000.000đ")
        XCTAssertEqual(budget.sub, "2.500.000đ/người")
        // No per-person line from the server → none shown, even though people = 4 and a total exists.
        let foodBudget = try XCTUnwrap(try food().overview.first { $0.kind == .budget })
        XCTAssertEqual(foodBudget.value, "1.200.000đ")
        XCTAssertNil(foodBudget.sub)
    }

    func testOverviewAndHighlightsComeFromTheServersFieldsOnly() throws {
        let card = try quyNhon()
        XCTAssertEqual(card.overview.map(\.kind), [.destination, .duration, .people, .budget])
        XCTAssertEqual(card.highlights.map(\.imageKey), ["diem-bien", "diem-hai-san", "diem-ngam-canh", "diem-di-tich"])
        XCTAssertTrue(card.tagline?.hasPrefix("Biển xanh") == true)
    }

    func testANonTravelAreaIsOneSessionWithTimesOfDayInTheSameFrame() throws {
        let card = try food()
        XCTAssertEqual(card.area, .food)
        XCTAssertEqual(card.days.count, 1)
        XCTAssertEqual(card.days.first?.label, "Tối nay")
        XCTAssertEqual(card.days.first?.stops.map(\.time), ["18:00", "19:30", "20:30"])
        XCTAssertEqual(card.heroKey, "an-uong-pho-1")
    }

    func testAreaFallsBackToThePlanningIntentWhenNoDomainIsWritten() throws {
        func area(_ json: String) throws -> PlanArea { PlanArea.of(try plan(json: json)) }
        XCTAssertEqual(try area(#"{"type":"evening","days":[]}"#), .entertainment)
        XCTAssertEqual(try area(#"{"type":"trip","days":[]}"#), .travel)
        XCTAssertEqual(try area(#"{"type":"evening","domain":"spa","days":[]}"#), .spa)
        XCTAssertEqual(try area(#"{"domain":"shopping","days":[]}"#), .shopping)
        XCTAssertEqual(try area(#"{"domain":"hotel","days":[]}"#), .travel)
        XCTAssertEqual(try area(#"{"days":[]}"#), .travel, "the only area that had plan cards before v2")
    }

    func testABlockWithNoV2FieldsStillDrawsWithPlaceholders() throws {
        let legacy = #"""
        {"type":"trip","title":"Đà Lạt 2 ngày","people":2,"budget_total":"3.000.000đ",
         "days":[{"label":"Ngày 1","items":[{"time":"08:00","emoji":"☕","name":"Cà phê Túi Mơ To","price":"chưa có giá","photo_url":"https://lh3.example/p/a"}]}]}
        """#
        let card = PlanCardModel.of(try plan(json: legacy))
        XCTAssertFalse(card.title.isEmpty)
        XCTAssertNil(card.heroKey, "no v2 hero in today's blocks → placeholder")
        XCTAssertTrue(card.days.flatMap(\.stops).allSatisfy { $0.imageKey == nil }, "no stored stop images → placeholders")
        XCTAssertTrue(card.days.flatMap(\.stops).allSatisfy { $0.priced || $0.price == PlanCardModel.noPrice })
        XCTAssertTrue(card.highlights.isEmpty)
    }

    func testImagesAreOnlyStoredKeysNeverAPhotoUrlNorAUrlPosingAsAKey() throws {
        let json = #"""
        {"title":"x","hero_image":"https://evil.example/x.jpg","days":[{"label":"Ngày 1","items":[
          {"time":"09:00","name":"A","photo_url":"https://lh3.googleusercontent.com/p/a"},
          {"time":"10:00","name":"B","image":"diem-bien"},
          {"time":"11:00","name":"C","image":"Diem Bien"}]}]}
        """#
        let card = PlanCardModel.of(try plan(json: json))
        XCTAssertNil(card.heroKey)
        XCTAssertEqual(card.days[0].stops.map(\.imageKey), [nil, "diem-bien", nil])
        // The view never reads `photoUrl`: an image is the manifest's URL for a stored key, or the area's placeholder.
        let source = try String(contentsOf: Self.repoRoot.appendingPathComponent("ios/TappyAI/Features/Chat/UI/PlanCardView.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("photoUrl"))
        XCTAssertTrue(source.contains("manifest.url(for: key)") && source.contains("area.placeholder"))
    }

    func testImageKeyNames() {
        XCTAssertTrue(PlanImageKeys.isHero("du-lich-bien-1"))
        XCTAssertTrue(PlanImageKeys.isHero("an-uong-pho-12"))
        XCTAssertTrue(PlanImageKeys.isHero("mua-sam-cho-dem-2"))
        XCTAssertFalse(PlanImageKeys.isHero("du-lich-bien"), "no N")
        XCTAssertFalse(PlanImageKeys.isHero("am-nhac-song-1"), "not one of the 5 areas")
        XCTAssertTrue(PlanImageKeys.isStop("diem-hai-san"))
        XCTAssertFalse(PlanImageKeys.isStop("diem"))
        XCTAssertFalse(PlanImageKeys.isKey("https://x/y.jpg"))
        XCTAssertEqual(PlanImageKeys.area(of: "spa-thu-gian-3"), .spa)
        XCTAssertEqual(PlanImageKeys.area(of: "giai-tri-karaoke-1"), .entertainment)
    }

    func testAChainLongerThanMaxHopsStops() {
        let json = #"""
        {"images":{
          "diem-a":{"status":"replaced","replacement":"diem-b"},"diem-b":{"status":"replaced","replacement":"diem-c"},
          "diem-c":{"status":"replaced","replacement":"diem-d"},"diem-d":{"status":"replaced","replacement":"diem-e"},
          "diem-e":{"status":"active","url":"https://cdn.example/e.jpg"}}}
        """#
        let manifest = PlanImageManifest.parse(Data(json.utf8))
        XCTAssertEqual(manifest.url(for: "diem-b")?.absoluteString, "https://cdn.example/e.jpg")
        XCTAssertNil(manifest.url(for: "diem-a"))
    }

    func testAtMostFourHighlightsAndNoneWithoutALabel() throws {
        let json = #"""
        {"title":"t","days":[{"label":"d","items":[{"name":"A"}]}],
         "highlights":[{"label":"1"},{"label":" "},{"label":"2"},{"label":"3"},{"label":"4"},{"label":"5"}]}
        """#
        XCTAssertEqual(PlanCardModel.of(try plan(json: json)).highlights.map(\.label), ["1", "2", "3", "4"])
    }

    func testTheDecodedPlanKeepsItsV2Fields() throws {
        let p = try plan(fromReply: fixture("quy-nhon-v2.txt"))
        XCTAssertEqual(p.domain, "travel")
        XCTAssertEqual(p.heroImage, "du-lich-bien-1")
        XCTAssertEqual(p.budgetPerPerson, "2.500.000đ/người")
        XCTAssertEqual(p.highlights?.count, 4)
        XCTAssertEqual(p.days.first?.title, "Khám phá thành phố biển")
        XCTAssertEqual(p.days.first?.items.first?.image, "diem-bien")
    }
}
