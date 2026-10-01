import XCTest
@testable import TappyAI

/// Ask card v2 — the SAME cases as web `askCardModel.test.ts` + `AskCard.test.tsx` (and Android
/// `AskCardV2Test`): the question sets the router really emits for the 5 areas.
final class AskCardV2Tests: XCTestCase {
    private func Q(_ id: String, _ q: String, _ options: [String]) -> AskQuestion { AskQuestion(id: id, q: q, options: options) }

    private lazy var ENT = [Q("activity", "Muốn chơi gì?", ["Karaoke", "Xem phim", "Bar/pub", "Bida/bowling"]),
                            Q("party", "Mấy người / đi với ai?", ["1 mình", "2 người", "Nhóm 3-5", "Nhóm đông"]),
                            Q("time", "Đi lúc mấy giờ?", ["Chiều nay", "Tối nay", "Cuối tuần"])]
    private lazy var FOOD = [Q("dish", "Món gì / kiểu quán?", ["Món Việt", "Nhật/Hàn", "Lẩu/nướng", "Chưa biết"]),
                             Q("mode", "Ăn tại quán hay giao?", ["Ăn tại quán", "Giao tận nơi"]),
                             Q("area", "Khu vực nào?", ["Gần mình", "Quận 1", "Quận 3", "Quận 7"])]
    private lazy var SPA = [Q("service", "Muốn làm dịch vụ gì?", ["Massage", "Gội đầu dưỡng sinh", "Xông hơi", "Chăm sóc da"]),
                            Q("time", "Khi nào đi?", ["Hôm nay", "Tối nay", "Cuối tuần"])]
    private lazy var SPA_HAIR = [Q("style", "Làm tóc gì?", ["Cắt", "Uốn", "Nhuộm", "Phục hồi"]),
                                 Q("time", "Khi nào đi?", ["Hôm nay", "Tối nay", "Cuối tuần"])]
    private lazy var TRIP = [Q("date", "Đi khi nào, mấy ngày?", ["Cuối tuần 2N1Đ", "3N2Đ", "4-5 ngày", "Chưa chốt"]),
                             Q("origin", "Xuất phát từ đâu?", ["TP.HCM", "Hà Nội", "Đà Nẵng", "Nơi khác"]),
                             Q("style", "Thích kiểu gì?", ["Biển", "Núi", "Ăn uống", "Nghỉ dưỡng"])]
    private lazy var HOTEL = [Q("party", "Mấy người?", ["1 người", "2 người", "Gia đình", "Nhóm bạn"]),
                              Q("budget", "Tầm giá mỗi đêm?", ["Dưới 700k", "700k-1,5tr", "1,5-3tr", "Trên 3tr"])]
    private lazy var SHOP = [Q("line", "Loại nào?", ["Nhét tai", "Chụp tai", "Chưa biết"]),
                             Q("budget", "Tầm giá bao nhiêu?", ["Dưới 1tr", "1-3tr", "3-5tr", "Trên 5tr"]),
                             Q("must", "Cần chống ồn không?", ["Có chống ồn", "Không cần"])]

    // MARK: I-3 (server 01/10) — the area comes from the question ids, never defaults to travel

    private lazy var FLIGHT = [Q("origin", "Bay từ đâu?", ["Từ TP.HCM", "Từ Hà Nội", "Từ nơi khác"])]

    func testFlightOriginIsATravelAskWithPlacePins() {
        XCTAssertEqual(AskCardModel.areaOf(FLIGHT), .travel)
        XCTAssertEqual(AskCardModel.kindOf(FLIGHT[0]), .other, "a one-pick icon step, not the type tiles")
        let view = AskCardModel.viewOf(FLIGHT)[0]
        XCTAssertEqual(view.options.map(\.icon), [.mapPin, .mapPin, .mapPin])
        XCTAssertTrue(view.options.allSatisfy { $0.imageKey == nil })
        XCTAssertEqual(AskCardModel.sendText(AskCardModel.viewOf(FLIGHT), chosen: ["origin": ["Từ Hà Nội"]]), "Từ Hà Nội")
    }

    func testTheNewRouterIdsKeepFoodAndSpaOutOfTravel() {
        // «dish» / «service» used to be «style», which falls back to travel unless the options are spa words.
        XCTAssertEqual(AskCardModel.areaOf([Q("dish", "Món gì?", ["Phở", "Bún"]), Q("date", "Khi nào?", ["Tối nay"])]), .food)
        XCTAssertEqual(AskCardModel.areaOf([Q("service", "Dịch vụ gì?", ["Cắt tỉa", "Xông hơi"]), Q("date", "Khi nào?", ["Tối nay"])]), .spa)
        XCTAssertEqual(AskCardModel.kindOf(Q("dish", "x", ["a"])), .type)
        XCTAssertEqual(AskCardModel.kindOf(Q("service", "x", ["a"])), .type)
    }

    func testAnUnknownAskIsMainNotTravel() {
        XCTAssertEqual(AskCardModel.areaOf([Q("zzz", "Gì đó?", ["a", "b"])]), .main)
    }

    // MARK: README §2 — kinds from `id` first, then the words of `q`

    func testAreaOfEachOfTheFiveAreas() {
        XCTAssertEqual([ENT, FOOD, SPA, SPA_HAIR, TRIP, HOTEL, SHOP].map(AskCardModel.areaOf),
                       [.entertainment, .food, .spa, .spa, .travel, .travel, .shopping])
    }

    func testKinds() {
        XCTAssertEqual(ENT.map(AskCardModel.kindOf), [.type, .party, .time])
        XCTAssertEqual(FOOD.map(AskCardModel.kindOf), [.type, .other, .other])
        XCTAssertEqual(SPA.map(AskCardModel.kindOf), [.type, .time])
        XCTAssertEqual(TRIP.map(AskCardModel.kindOf), [.time, .other, .type])
        XCTAssertEqual(HOTEL.map(AskCardModel.kindOf), [.party, .budget])
        XCTAssertEqual(SHOP.map(AskCardModel.kindOf), [.type, .budget, .other])
        XCTAssertEqual(AskCardModel.kindOf(Q("x", "Bạn thích thể loại nào?", ["a", "b"])), .type)
        XCTAssertEqual(AskCardModel.kindOf(Q("x", "Đi với ai?", ["a", "b"])), .party)
    }

    // MARK: README §3 — tile image keys and icons

    func testOwnerNamedKeys() {
        XCTAssertEqual(ENT[0].options.map(AskCardModel.tileKeyOf), ["diem-karaoke", "diem-rap-phim", "diem-bar-rooftop", "diem-bida"])
        XCTAssertEqual(["Bowling", "Cafe/rooftop", "Trà sữa", "Lẩu/nướng", "Nhật/Hàn", "Món Việt", "Phở/bún", "Ăn uống"].map(AskCardModel.tileKeyOf),
                       ["diem-bowling", "diem-cafe", "diem-cafe", "diem-lau-nuong", "diem-mon-nhat-han", "diem-quan-an", "diem-quan-an", "diem-quan-an"])
        XCTAssertEqual(["Massage", "Gội đầu dưỡng sinh", "Sơn gel", "Biển", "Núi", "Rap / hip-hop"].map(AskCardModel.tileKeyOf),
                       ["diem-spa", "diem-spa", "diem-son-gel", "diem-bien", "diem-nui", "diem-am-nhac"])
    }

    func testWordsThatCollideWithoutMarksAreMatchedWithMarks() {
        XCTAssertEqual(AskCardModel.tileKeyOf("Dạo phố"), "diem-dao-pho")
        XCTAssertEqual(AskCardModel.tileKeyOf("Pin lâu"), "diem-pin-lau")
        XCTAssertEqual(AskCardModel.tileKeyOf("Đỏ"), "diem-do")
        XCTAssertEqual(AskCardModel.tileKeyOf("Làm nail"), "diem-nail")
    }

    func testNotSureHasNoImageAndUnknownGetsTheSameNameKey() {
        XCTAssertNil(AskCardModel.tileKeyOf("Chưa biết"))
        XCTAssertNil(AskCardModel.tileKeyOf("Không quan trọng"))
        XCTAssertEqual(AskCardModel.tileKeyOf("Chăm sóc da"), "diem-cham-soc-da")
        XCTAssertEqual(AskCardModel.iconOf("Chưa biết", kind: .type), .help)
    }

    func testPartyTimeBudgetIcons() {
        XCTAssertEqual(ENT[1].options.map { AskCardModel.iconOf($0, kind: .party) }, [.user, .users, .usersRound, .usersRound])
        XCTAssertEqual(ENT[2].options.map { AskCardModel.iconOf($0, kind: .time) }, [.sun, .moon, .calendar])
        XCTAssertEqual(AskCardModel.iconOf("3N2Đ", kind: .time), .calendar)
        XCTAssertEqual(AskCardModel.iconOf("Dưới 1tr", kind: .budget), .wallet)
        XCTAssertEqual(FOOD[2].options.map { AskCardModel.iconOf($0, kind: .other) }, [.mapPin, .mapPin, .mapPin, .mapPin])
        XCTAssertEqual(["Bình Thạnh", "Thủ Đức"].map { AskCardModel.iconOf($0, kind: .other, question: "Khu vực nào?") }, [.mapPin, .mapPin])
        XCTAssertEqual(AskCardModel.iconOf("Bình Thạnh", kind: .other), .sparkles)
    }

    // MARK: README §0 — the reply is unchanged for the server

    func testMergesMultiChoiceSingleChoicesAndTypedText() {
        let views = AskCardModel.viewOf(ENT)
        let chosen: [String: Set<String>] = ["time": ["Tối nay"], "activity": ["Bida/bowling", "Karaoke"], "party": ["2 người"]]
        XCTAssertEqual(AskCardModel.composeAnswer(views, chosen: chosen, free: "  ít ồn "), "Karaoke, Bida/bowling · 2 người · Tối nay · ít ồn")
        XCTAssertEqual(AskCardModel.sendText(views, chosen: chosen), "Karaoke, Bida/bowling · 2 người · Tối nay")
    }

    func testPartialAnswersAndTypedTextOnly() {
        let views = AskCardModel.viewOf(FOOD)
        XCTAssertEqual(AskCardModel.sendText(views, chosen: ["dish": [], "mode": [], "area": ["Quận 3"]]), "Quận 3")
        XCTAssertEqual(AskCardModel.sendText(views, chosen: [:], free: "không cay"), "không cay")
    }

    func testNothingChosenStillSearches() {
        XCTAssertEqual(AskCardModel.sendText(AskCardModel.viewOf(ENT), chosen: [:], free: "   "), AskCardModel.emptyAnswer)
        XCTAssertEqual(AskCardModel.emptyAnswer, "Tìm cho tôi")
    }

    // MARK: AskCard.test.tsx — type takes several, the others one, tap again clears

    func testSelectionRules() {
        let v = AskCardModel.viewOf(ENT)
        var chosen: [String: Set<String>] = [:]
        chosen = AskCardModel.toggle(chosen, v[0], "Karaoke")
        chosen = AskCardModel.toggle(chosen, v[0], "Bida/bowling")
        chosen = AskCardModel.toggle(chosen, v[1], "1 mình")
        chosen = AskCardModel.toggle(chosen, v[1], "2 người")
        chosen = AskCardModel.toggle(chosen, v[2], "Tối nay")
        XCTAssertEqual(chosen["activity"], ["Karaoke", "Bida/bowling"])
        XCTAssertEqual(chosen["party"], ["2 người"], "one pick: the second replaces the first")
        XCTAssertEqual(AskCardModel.sendText(v, chosen: chosen, free: "có view đẹp"), "Karaoke, Bida/bowling · 2 người · Tối nay · có view đẹp")
        chosen = AskCardModel.toggle(chosen, v[2], "Tối nay")
        XCTAssertEqual(chosen["time"], [], "tap again clears")
    }

    func testViewCarriesImageKeysOnlyForTheTypeQuestion() {
        let v = AskCardModel.viewOf(ENT)
        XCTAssertEqual(v.map(\.number), [1, 2, 3])
        XCTAssertEqual(v[0].options.first?.imageKey, "diem-karaoke")
        XCTAssertNil(v[1].options.first?.imageKey)
    }

    // MARK: R22 manifest

    func testManifestFollowsReplacementsAndRefusesNonHttps() {
        let json = """
        {"version":"t","images":{
          "diem-bar":{"status":"replaced","replacement":"diem-bar-rooftop"},
          "diem-bar-rooftop":{"status":"active","url":"https://cdn.example/bar.webp"},
          "diem-a":{"status":"replaced","replacement":"diem-b"},"diem-b":{"status":"replaced","replacement":"diem-a"},
          "diem-http":{"status":"active","url":"http://x/y.png"},
          "BAD KEY":{"status":"active","url":"https://x"}}}
        """
        let m = PlanImageManifest.parse(Data(json.utf8))
        XCTAssertEqual(m.url(for: "diem-bar")?.absoluteString, "https://cdn.example/bar.webp")
        XCTAssertNil(m.url(for: "diem-a"), "a cycle ends")
        XCTAssertNil(m.url(for: "diem-http"))
        XCTAssertNil(m.url(for: "diem-karaoke"), "missing key → placeholder")
        XCTAssertNil(m.entries["BAD KEY"])
        XCTAssertEqual(PlanImageManifest.parse(Data("{}".utf8)), .empty)
    }
}
