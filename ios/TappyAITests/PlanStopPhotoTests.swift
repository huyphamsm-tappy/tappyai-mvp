import XCTest
@testable import TappyAI

/// Owner 02/11 (iOS = the web; the 29/09 rule that a stop never shows its server photo is dropped): the web draws the photo the server matched to
/// a stop (TripPlanCard.tsx `photo_url`) and shows a stop that has words but no name. Same cases as Android `PlanStopPhotoTest`.
final class PlanStopPhotoTests: XCTestCase {

    private func card(_ items: String) throws -> PlanCardModel {
        let json = #"{"type":"trip","title":"Đà Nẵng 2 ngày","days":[{"label":"Ngày 1 — Trung tâm","items":["# + items + #"]}]}"#
        return PlanCardModel.of(try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8)))
    }

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    func testAStopsOwnHttpsPhotoIsCarriedAnyOtherAddressIsNot() throws {
        let c = try card(#"""
        {"time":"09:00","emoji":"🏛","name":"Bảo tàng Chăm","photo_url":"https://lh3.googleusercontent.com/a"},
        {"time":"11:00","emoji":"🍜","name":"Mì Quảng","photo_url":"http://insecure.example/b"},
        {"time":"13:00","emoji":"☕","name":"Cafe","photo_url":"javascript:alert(1)"},
        {"time":"14:00","emoji":"🤖","name":"Lạ","photo_url":"https://chatgpt.com/x.png"},
        {"time":"15:00","emoji":"🌉","name":"Cầu Rồng"}
        """#)
        XCTAssertEqual(c.days[0].stops.map { $0.photoUrl?.absoluteString },
                       ["https://lh3.googleusercontent.com/a", nil, nil, nil, nil])
    }

    func testTheCardDrawsTheStopsPhotoBeforeTheKeyPicture() throws {
        let ui = try source("TappyAI/Features/Chat/UI/PlanCardView.swift")
        XCTAssertTrue(ui.contains("photoUrl: stop.photoUrl"))
        XCTAssertTrue(ui.contains("photoUrl ?? manifest.url(for: key)"))
    }

    func testAStopWithNoNameStillShowsItsWordsStandInForTheName() throws {
        let c = try card(#"{"time":"09:00","emoji":"🌅","name":"","description":"Ngắm bình minh trên biển"},{"time":"10:00","emoji":"🏛","name":"Bảo tàng"}"#)
        XCTAssertEqual(c.days[0].stops.count, 2)
        XCTAssertEqual(c.days[0].stops[0].name, "Ngắm bình minh trên biển")
        XCTAssertNil(c.days[0].stops[0].description, "the words are the name: not printed twice")
    }

    func testAStopWithNeitherANameNorWordsIsDropped() throws {
        let c = try card(#"{"time":"09:00","emoji":"📍","name":""},{"time":"10:00","emoji":"🏛","name":"Bảo tàng"}"#)
        XCTAssertEqual(c.days[0].stops.map(\.name), ["Bảo tàng"])
    }

    func testTheDecodedItemKeepsItsWordsWhenItHasNoName() throws {
        let json = #"{"days":[{"label":"Ngày 1","items":[{"description":"Chỉ có mô tả"},{"time":"09:00"}]}]}"#
        let p = try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8))
        XCTAssertEqual(p.days[0].items.map(\.name), [""])
        XCTAssertEqual(p.days[0].items.map(\.description), ["Chỉ có mô tả"])
    }
}
