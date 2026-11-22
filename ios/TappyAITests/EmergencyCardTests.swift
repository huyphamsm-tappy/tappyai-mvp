import XCTest
@testable import TappyAI

/// The emergency card: the stream's `tappy.safety.v1` annotation (web `src/lib/safety/emergencyResponse.ts`, reader `readSafetyAnnotation`).
final class EmergencyCardTests: XCTestCase {

    private let annotation = #"""
    8:[{"kind":"tappy.safety.v1","v":1,"category":"CHILD_PROTECTION","cards":[
      {"hotlineId":"h111","displayName":"Tổng đài bảo vệ trẻ em","phoneNumber":"111","operatingHours":"24/7","freeOfCharge":true,"sourceUrl":"https://example.org/a"},
      {"hotlineId":"h113","displayName":"Công an","phoneNumber":"113","sourceUrl":"https://example.org/b"}],
     "askedLocation":false,"lang":"vi"}]
    """#.replacingOccurrences(of: "\n", with: "")

    func testTheStreamReadsTheCards() throws {
        let frames = DataStreamLineParser.frames(line: annotation)
        guard case .safety(let cards)? = frames.first else { return XCTFail("a safety frame, got \(frames)") }
        XCTAssertEqual(cards.map(\.phoneNumber), ["111", "113"])
        XCTAssertEqual(cards[0].displayName, "Tổng đài bảo vệ trẻ em")
        XCTAssertEqual(cards[0].operatingHours, "24/7")
        XCTAssertTrue(cards[0].freeOfCharge)
        XCTAssertNil(cards[1].operatingHours, "an hour the server did not state is not guessed")
        XCTAssertFalse(cards[1].freeOfCharge)
        XCTAssertEqual(cards[0].telURL?.absoluteString, "tel:111")
    }

    func testOnlyShortNumbersBecomeAButton() {
        let o: [String: Any] = ["kind": safetyAnnotationKind, "cards": [
            ["displayName": "ok", "phoneNumber": "113"],
            ["displayName": "too long", "phoneNumber": "0692345860"],
            ["displayName": "letters", "phoneNumber": "11a"],
            ["displayName": "dial string", "phoneNumber": "113;rm"],
            ["displayName": "", "phoneNumber": "115"],
            ["displayName": "one digit", "phoneNumber": "1"],
            ["displayName": "arabic-indic digits", "phoneNumber": "١١٣"],
        ]]
        XCTAssertEqual(EmergencyFrames.cards(o).map(\.phoneNumber), ["113"])
    }

    func testAnAnnotationWithNothingUsableIsNoFrame() {
        let none = #"8:[{"kind":"tappy.safety.v1","v":1,"cards":[]}]"#
        guard case .unknown? = DataStreamLineParser.frames(line: none).first else { return XCTFail("no usable card is not a safety frame") }
        let wrongKind = EmergencyFrames.cards(["kind": "tappy.places.v1", "cards": [["displayName": "x", "phoneNumber": "113"]]])
        XCTAssertTrue(wrongKind.isEmpty)
    }

    func testTheCardNeverHoldsMoreThanTheCap() {
        let many = (100..<120).map { ["displayName": "n\($0)", "phoneNumber": "\($0)"] }
        XCTAssertEqual(EmergencyFrames.cards(["kind": safetyAnnotationKind, "cards": many]).count, EmergencyFrames.maxCards)
    }

    func testDetailSaysOnlyWhatTheServerStated() {
        XCTAssertNil(EmergencyCardView.detail(hours: nil, free: false))
        XCTAssertEqual(EmergencyCardView.detail(hours: nil, free: true), NSLocalizedString("safety.emergency.free", comment: ""))
        XCTAssertTrue(EmergencyCardView.detail(hours: "24/7", free: true)?.contains("24/7") == true)
    }

    func testEveryStringTheCardShowsHasACatalogEntry() {
        for key in ["safety.emergency.cardsTitle", "safety.emergency.hours", "safety.emergency.free"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
