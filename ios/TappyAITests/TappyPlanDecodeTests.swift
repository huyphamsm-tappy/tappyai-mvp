import XCTest
@testable import TappyAI

/// `TappyPlan` must decode the block the backend actually emits (see the model's doc comment),
/// and must never turn a block in another shape into a plan whose days have nothing in them.
final class TappyPlanDecodeTests: XCTestCase {

    private func plan(_ json: String) -> TappyPlan? {
        ContentParser.parse("Kế hoạch đây.\n[TAPPY_PLAN]\(json)[/TAPPY_PLAN]").plan
    }

    // MARK: - Real blocks

    func testDecodesARealOneDayPlanWithEveryWireField() throws {
        let p = try XCTUnwrap(plan(PlanFixtures.hoiAnOneDay))
        XCTAssertEqual(p.type, "trip")
        XCTAssertEqual(p.title, "Khám phá Hội An trong 1 ngày")
        XCTAssertEqual(p.people, 1)
        XCTAssertEqual(p.days.count, 1)
        XCTAssertEqual(p.days[0].label, "Hôm nay (18/9)")
        XCTAssertEqual(p.days[0].items.count, 5)

        let first = p.days[0].items[0]
        XCTAssertEqual(first.time, "08:00")
        XCTAssertEqual(first.emoji, "🚤")
        XCTAssertEqual(first.category, "attraction", "category is a free string — the model goes beyond the prompt's enum")
        XCTAssertEqual(first.name, "Hoi An Coconut Village - Coconut Basket Boat Tour")
        XCTAssertEqual(first.address, "39 Cửa Đại, Hội An Đông, Đà Nẵng")
        XCTAssertEqual(first.mapsLink, "https://maps.google.com/?cid=9729814368620428803")
        XCTAssertEqual(first.bookingLink, "https://wa.me/+84782329836")
        XCTAssertEqual(first.placeId, "ChIJX6QgMAAPQjERA74cFJ4-B4c")
        XCTAssertNotNil(first.description)
        XCTAssertEqual(p.shareText, "Khám phá Hội An trong 1 ngày: thuyền dừa, phố cổ, ăn ngon, show tối 🌙 #TappyAI")

        // Every price in this block is the "chưa có giá" sentinel: none of them is a price.
        XCTAssertNil(p.budgetTotal)
        XCTAssertNil(p.costBreakdown)
        XCTAssertTrue(p.days[0].items.allSatisfy { $0.price == nil })
    }

    func testDecodesARealMultiDayPlanIncludingAnEmptyTrailingDay() throws {
        let p = try XCTUnwrap(plan(PlanFixtures.daNangThreeDays))
        XCTAssertEqual(p.people, 2)
        XCTAssertEqual(p.budgetTotal, "6.000.000 VND")
        XCTAssertEqual(p.days.map(\.label),
                       ["Ngày 1 - Thứ Sáu 26/9", "Ngày 2 - Thứ Bảy 27/9", "Ngày 3 - Chủ Nhật 28/9", "Chi tiết chi phí"])
        XCTAssertEqual(p.days.map(\.items.count), [3, 5, 5, 0])
        let nightMarket = p.days[0].items[2]
        XCTAssertEqual(nightMarket.name, "Phố đi bộ - Chợ đêm Bạch Đằng")
        XCTAssertEqual(nightMarket.price, "Miễn phí", "free is an amount")
        XCTAssertNil(p.days[2].items[4].price, "\"Đã tính\" states no amount")
    }

    // MARK: - Required fields: never silently empty days

    func testTheOldIOSShapeIsNotAPlan() {
        // What the previous model expected (title/activities). It decoded every real block as days
        // with no content; a block in this shape must now simply not be a plan.
        XCTAssertNil(plan(#"{"days":[{"day":1,"title":"Ngày 1","activities":[{"time":"09:00","title":"Bãi Kỳ Co","cost":"100k"}]}]}"#))
    }

    func testMissingDaysIsNotAPlan() {
        XCTAssertNil(plan(#"{"type":"trip","title":"Đà Nẵng"}"#))
        XCTAssertNil(plan(#"{"title":"Đà Nẵng","days":{"label":"Ngày 1"}}"#))
    }

    func testOneBrokenDayIsDroppedNotTheWholePlan() throws {
        // Day 2 has no `items` array: only that day goes. Day 3's items have no names, so it stays
        // as a well-formed day with no stops (like the backend's empty trailing day).
        let p = try XCTUnwrap(plan(#"{"title":"Đà Nẵng","days":[{"label":"Ngày 1","items":[{"name":"A"}]},{"label":"Ngày 2"},{"label":"Ngày 3","items":[{"time":"09:00"}]},{"label":"Ngày 4","items":[{"name":"B"}]}]}"#))
        XCTAssertEqual(p.days.map(\.label), ["Ngày 1", "Ngày 3", "Ngày 4"])
        XCTAssertEqual(p.days.map(\.items.count), [1, 0, 1])
    }

    func testNoWellFormedDayIsNotAPlan() {
        XCTAssertNil(plan(#"{"title":"Đà Nẵng","days":[{"label":"Ngày 1"},{"label":"Ngày 2","stops":[]}]}"#))
    }

    // MARK: - Card content (web TripPlanCard)

    func testCardSummaryTipsAndLinks() throws {
        let p = try XCTUnwrap(plan(#"""
        {"title":"Đà Nẵng","people":3,"budget_total":"2.500.000đ","days":[{"label":"Ngày 1","items":[{"name":"A","maps_link":"https://maps.google.com/?q=A","booking_link":"javascript:alert(1)"}]}],
         "cost_breakdown":{"Ăn uống":"800.000đ","Khách sạn":"chưa có giá"},
         "local_tips":[{"text":"Đi sớm","basis":"tool","place":"Bà Nà"},{"text":"Mang áo mưa","basis":"general"},{"text":"  ","basis":"general"}]}
        """#))
        XCTAssertEqual(PlanCardContent.summary(p), String(format: NSLocalizedString("chat.plan.people", comment: ""), 3) + " · 2.500.000đ")
        XCTAssertEqual(p.costBreakdown, ["Ăn uống": "800.000đ"], "a no-price sentinel is not a cost")
        let tips = PlanCardContent.tips(p)
        XCTAssertEqual(tips.map { $0.text }, ["Đi sớm", "Mang áo mưa"])
        XCTAssertEqual(tips.map { $0.place }, ["Bà Nà", nil])
        XCTAssertNotNil(PlanCardContent.link(p.days[0].items[0].mapsLink))
        XCTAssertNil(PlanCardContent.link(p.days[0].items[0].bookingLink), "only http(s) links open")
    }

    func testSummaryWithoutPeopleOrBudget() throws {
        let solo = try XCTUnwrap(plan(#"{"people":1,"days":[{"label":"","items":[{"name":"A"}]}]}"#))
        XCTAssertNil(PlanCardContent.summary(solo))
        let budgetOnly = try XCTUnwrap(plan(#"{"budget_total":"500k","days":[{"label":"","items":[{"name":"A"}]}]}"#))
        XCTAssertEqual(PlanCardContent.summary(budgetOnly), "500k")
    }

    func testCardStringsExist() {
        for key in ["chat.plan.people", "chat.plan.map", "chat.plan.bookNow", "chat.plan.localTips",
                    "chat.plan.generalTip", "chat.plan.costBreakdown", "chat.plan.totalEstimate"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }

    func testAnItemWithoutANameIsDroppedNotShownBlank() throws {
        let p = try XCTUnwrap(plan(#"{"days":[{"label":"Ngày 1","items":[{"time":"09:00"},{"time":"10:00","name":"  "},{"time":"11:00","name":"Chợ Hàn"}]}]}"#))
        XCTAssertEqual(p.days[0].items.map(\.name), ["Chợ Hàn"])
    }

    func testOptionalFieldsDefaultAndBlankLinksAreAbsent() throws {
        let p = try XCTUnwrap(plan(#"{"days":[{"items":[{"name":"Ăn tối","maps_link":"","booking_link":"  "}]}]}"#))
        XCTAssertEqual(p.title, "")
        XCTAssertNil(p.type)
        XCTAssertEqual(p.days[0].label, "", "a missing label is empty; surfaces number the day")
        let item = p.days[0].items[0]
        XCTAssertEqual(item.time, "")
        XCTAssertNil(item.mapsLink)
        XCTAssertNil(item.bookingLink)
    }

    func testLocalTipsAreDecodedAndAMalformedTipIsSkipped() throws {
        let p = try XCTUnwrap(plan(#"{"days":[{"label":"Ngày 1","items":[{"name":"A"}]}],"local_tips":[{"text":"Đi sớm","basis":"general"},{"basis":"tool"}]}"#))
        XCTAssertEqual(p.localTips, [TappyPlan.LocalTip(text: "Đi sớm", basis: "general", place: nil)])
    }

    // MARK: - Price projection (web `planAmount`)

    func testPlanPriceKeepsOnlyAmounts() {
        for kept in ["150.000đ", "200k", "1,2 triệu", "Miễn phí", "miễn phí vào cửa", "Free", "1-100k VND/người"] {
            XCTAssertEqual(PlanPrice.amount(kept), kept, kept)
        }
        for dropped in ["chưa có giá", "Chưa có giá cụ thể", "Chưa rõ giá", "price not available", "No price",
                        "N/A", "unknown", "Đã tính", "Freedom", "", "   ", nil] as [String?] {
            XCTAssertNil(PlanPrice.amount(dropped), dropped ?? "nil")
        }
        XCTAssertEqual(PlanPrice.amount("  150k  "), "150k")
    }

    // MARK: - The share brochure reads the real structure

    func testBrochureCarriesEveryStopFromTheRealBlock() throws {
        let parsed = ContentParser.parse("x\n[TAPPY_PLAN]\(PlanFixtures.hoiAnOneDay)[/TAPPY_PLAN]")
        let p = try XCTUnwrap(parsed.plan)
        let a = ShareArtifactBuilder.buildPlanArtifact(p, title: "turn subject", lang: "vi", planJSON: parsed.planJSON)
        XCTAssertEqual(a.subject, "Kế hoạch từ TappyAI: Khám phá Hội An trong 1 ngày", "the plan's own title wins")
        XCTAssertTrue(a.text.hasPrefix("Kế hoạch từ TappyAI: Khám phá Hội An trong 1 ngày\n"))
        XCTAssertTrue(a.text.contains("1 người"))
        XCTAssertTrue(a.text.contains("\nHôm nay (18/9)\n"))
        for item in p.days[0].items {
            XCTAssertTrue(a.text.contains("  \(item.time) \(item.emoji) \(item.name)"), item.name)
        }
        XCTAssertTrue(a.text.contains("Bản đồ: https://maps.google.com/?cid=9729814368620428803"))
        XCTAssertFalse(a.text.contains("chưa có giá"), "a sentinel is not a price")
        XCTAssertFalse(a.text.contains("http://hoianmemoriesland.com/"), "only https links are shared")
        XCTAssertEqual(a.planJSON, PlanFixtures.hoiAnOneDay)
    }

    func testBrochureNumbersADayWithoutALabelAndFallsBackToTheTurnTitle() throws {
        // The shared marker fixture's shape: a day with `title` (not a plan field) and no `label`.
        let p = try XCTUnwrap(plan(#"{"days":[{"title":"Tối nay","items":[{"time":"19:00","name":"Ăn tối"}]}]}"#))
        let vi = ShareArtifactBuilder.buildPlanArtifact(p, title: "Tối nay đi đâu", lang: "vi")
        XCTAssertEqual(vi.subject, "Kế hoạch từ TappyAI: Tối nay đi đâu")
        XCTAssertTrue(vi.text.contains("Ngày 1\n  19:00 Ăn tối"))
        let en = ShareArtifactBuilder.buildPlanArtifact(p, title: "Tonight", lang: "en")
        XCTAssertTrue(en.text.contains("Day 1\n  19:00 Ăn tối"))
    }
}
