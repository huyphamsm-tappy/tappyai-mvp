import XCTest
@testable import TappyAI

/// "Chỗ ở gợi ý" and "Món nên thử" of a trip plan (web `planStaysDishes.ts` on the server, `TripTimeline.tsx` on the web, owner 20/11/2026).
/// The server keeps only what the turn's lookups support; the app re-checks the shape and never writes a fact.
final class PlanStaysDishesTests: XCTestCase {

    private func plan(extra: String) throws -> TappyPlan {
        let json = #"{"type":"trip","title":"Quy Nhơn","days":[{"label":"Ngày 1","items":[{"time":"09:00","name":"Bãi Kỳ Co"}]}],"# + extra + "}"
        return try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8))
    }

    func testStaysAndDishesDecode() throws {
        let p = try plan(extra: #""stays":[{"name":"Seaside Hotel","why":"Gần biển","price":"1.200.000đ/đêm","address":"1 Xuân Diệu","booking_link":"https://www.agoda.com/h/1"}],"dishes":[{"dish":"Bánh xèo tôm nhảy","venue":"Quán Bà Hai","address":"2 Tăng Bạt Hổ","price":"60.000đ","note":"Giòn"},{"dish":"Bún chả cá"}]"#)
        let stay = try XCTUnwrap(p.stays?.first)
        XCTAssertEqual(stay.name, "Seaside Hotel")
        XCTAssertEqual(stay.price, "1.200.000đ/đêm")
        XCTAssertEqual(stay.bookingLink, "https://www.agoda.com/h/1")
        XCTAssertEqual(p.dishes?.count, 2)
        XCTAssertEqual(p.dishes?[0].venue, "Quán Bà Hai")
        XCTAssertNil(p.dishes?[1].venue, "a dish with no searched venue stays a dish")
    }

    func testAPlanWithoutThemStillDecodesWithNeither() throws {
        let p = try plan(extra: #""local_tips":[]"#)
        XCTAssertNil(p.stays)
        XCTAssertNil(p.dishes)
    }

    func testOnlyHttpsBookingLinksSurvive() throws {
        let p = try plan(extra: #""stays":[{"name":"A","booking_link":"http://insecure.example/x"},{"name":"B","booking_link":"javascript:alert(1)"},{"name":"C","booking_link":"https://ok.example/y"}]"#)
        XCTAssertEqual(p.stays?.map(\.bookingLink), [nil, nil, "https://ok.example/y"])
    }

    func testTextWithALinkOrAMarkerIsNotShown() throws {
        let p = try plan(extra: #""stays":[{"name":"Hotel https://evil.example"},{"name":"Fine","why":"see www.x.com"}],"dishes":[{"dish":"Mì [TAPPY_PLAN]x"},{"dish":"Chả cá","note":"[FOLLOWUPS]a|b"}]"#)
        XCTAssertEqual(p.stays?.map(\.name), ["Fine"], "a name with a link is not a stay")
        XCTAssertNil(p.stays?.first?.why, "words with a link are dropped, the stay stays")
        XCTAssertEqual(p.dishes?.map(\.dish), ["Chả cá"])
        XCTAssertNil(p.dishes?.first?.note)
    }

    func testTheCardsAreCappedAtThreeStaysAndSixDishes() throws {
        let stays = (1...5).map { #"{"name":"Hotel \#($0)"}"# }.joined(separator: ",")
        let dishes = (1...9).map { #"{"dish":"Món \#($0)"}"# }.joined(separator: ",")
        let p = try plan(extra: "\"stays\":[\(stays)],\"dishes\":[\(dishes)]")
        XCTAssertEqual(p.stays?.count, 3)
        XCTAssertEqual(p.dishes?.count, 6)
    }

    func testOneBadEntryDoesNotSinkTheRest() throws {
        let p = try plan(extra: #""stays":[{"why":"no name"},{"name":"Good"}],"dishes":[42,{"dish":"Ok"}]"#)
        XCTAssertEqual(p.stays?.map(\.name), ["Good"])
        XCTAssertEqual(p.dishes?.map(\.dish), ["Ok"])
    }

    func testTheDishLineIsVenueThenNote() {
        func d(_ venue: String?, _ note: String?) throws -> TappyPlan.Dish {
            var parts = [#""dish":"X""#]
            if let venue { parts.append("\"venue\":\"\(venue)\"") }
            if let note { parts.append("\"note\":\"\(note)\"") }
            return try ResponseDecoder.json.decode(TappyPlan.Dish.self, from: Data(("{" + parts.joined(separator: ",") + "}").utf8))
        }
        XCTAssertEqual(ChatPlanCardView.dishLine(try d("Quán A", "Giòn")), "Quán A · Giòn")
        XCTAssertEqual(ChatPlanCardView.dishLine(try d("Quán A", nil)), "Quán A")
        XCTAssertEqual(ChatPlanCardView.dishLine(try d(nil, "Giòn")), "Giòn")
        XCTAssertNil(ChatPlanCardView.dishLine(try d(nil, nil)))
    }

    func testTheFutureMarkerNeverReachesTheReader() {
        let leaked = ContentParser.stripMarkerResidue("Xin chào [TAPPY_FUTURE]{\"a\":1}[/TAPPY_FUTURE] tạm biệt")
        XCTAssertFalse(leaked.contains("TAPPY_FUTURE"))
        XCTAssertFalse(leaked.contains("\"a\""))
        XCTAssertTrue(ContentParser.markerNames.contains("TAPPY_FUTURE"))
    }

    func testEveryStringThePanelsShowHasACatalogEntry() {
        for key in ["chat.plan.stays", "chat.plan.dishes", "chat.plan.bookStay"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
