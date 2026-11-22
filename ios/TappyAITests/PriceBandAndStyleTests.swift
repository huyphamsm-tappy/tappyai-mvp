import XCTest
@testable import TappyAI

/// Two web rules the iOS chat was missing: the provider's price band read the way a person reads it (`priceBand.ts`), and the reply style the
/// person chose in "Tappy knows" actually travelling with the request (`route.ts` reads an object `{tone, length}`).
final class PriceBandAndStyleTests: XCTestCase {

    // MARK: Price band

    func testAnOpenLowerBoundIsUpToNotFromOneDong() {
        XCTAssertEqual(PriceBand.format("1-100.000 ₫", lang: "vi"), "dưới 100.000 ₫")
        XCTAssertEqual(PriceBand.format("1-100.000 ₫", lang: "en"), "under 100,000 ₫")
        XCTAssertEqual(PriceBand.format("Dưới 50 N ₫", lang: "vi"), "dưới 50.000 ₫")
    }

    func testAClosedBandKeepsBothEnds() {
        XCTAssertEqual(PriceBand.format("100-200 N ₫", lang: "vi"), "100.000–200.000 ₫")
        XCTAssertEqual(PriceBand.format("100.000–200.000 ₫", lang: "en"), "100,000–200,000 ₫")
        XCTAssertEqual(PriceBand.format("1-2 Tr ₫", lang: "vi"), "1 triệu–2 triệu ₫")
    }

    func testAnOpenUpperBoundSaysOver() {
        XCTAssertEqual(PriceBand.format("Trên 1 Tr ₫", lang: "vi"), "trên 1 triệu ₫")
        XCTAssertEqual(PriceBand.format("Over 1,5 Tr ₫", lang: "vi"), "trên 1,5 triệu ₫")
        XCTAssertEqual(PriceBand.format("Over 1,5 Tr ₫", lang: "en"), "over 1.5M ₫")
    }

    func testAShapeItDoesNotKnowIsShownAsTheProviderWroteIt() {
        XCTAssertEqual(PriceBand.format("Giá rẻ", lang: "vi"), "Giá rẻ")
        XCTAssertEqual(PriceBand.format("200-100 N ₫", lang: "vi"), "200-100 N ₫", "a band whose low end is above its high end is not a band")
        XCTAssertNil(PriceBand.format("", lang: "vi"))
        XCTAssertNil(PriceBand.format("   ", lang: "vi"))
        XCTAssertNil(PriceBand.format(nil, lang: "vi"))
    }

    func testAmountsReadLikeAVietnameseReader() {
        XCTAssertEqual(PriceBand.amount("100", scaled: false), 100)
        XCTAssertEqual(PriceBand.amount("100.000", scaled: false), 100_000)
        XCTAssertEqual(PriceBand.amount("1,5", scaled: true), 1.5)
        XCTAssertEqual(PriceBand.amount("1.000.000", scaled: false), 1_000_000)
        XCTAssertEqual(PriceBand.amount("1.500", scaled: true), 1.5, "with a unit after it, three digits are a fraction")
    }

    func testTheLiveCardCarriesTheBand() throws {
        let json = #"{"kind":"tappy.places.v1","items":[{"id":"p","name":"Quán","priceRangeText":"100-200 N ₫"}]}"#
        let view = try ResponseDecoder.json.decode(PlacesLiveView.self, from: Data(json.utf8))
        XCTAssertEqual(view.items[0].toCardView().priceRangeText, "100-200 N ₫", "the live decoder dropped this field before")
    }

    // MARK: Reply style

    func testOnlyTheServersValuesAreSent() {
        XCTAssertEqual(ResponseStyle.wire(tone: "friendly", length: "short"), ["tone": "friendly", "length": "short"])
        XCTAssertEqual(ResponseStyle.wire(tone: "formal", length: nil), ["tone": "formal"])
        XCTAssertEqual(ResponseStyle.wire(tone: nil, length: "detailed"), ["length": "detailed"])
        XCTAssertNil(ResponseStyle.wire(tone: "", length: ""))
        XCTAssertNil(ResponseStyle.wire(tone: "angry", length: "novel"), "a value the server does not know is not sent")
        XCTAssertNil(ResponseStyle.wire(tone: nil, length: nil))
    }

    func testTheStyleTheSettingsScreenSavesIsTheOneTheChatReads() {
        let suite = UserDefaults(suiteName: "PriceBandAndStyleTests")!
        suite.removePersistentDomain(forName: "PriceBandAndStyleTests")
        XCTAssertNil(ResponseStyle.current(suite))
        suite.set("neutral", forKey: "tappy_response_tone")
        suite.set("detailed", forKey: "tappy_response_length")
        XCTAssertEqual(ResponseStyle.current(suite), ["tone": "neutral", "length": "detailed"])
        suite.removePersistentDomain(forName: "PriceBandAndStyleTests")
    }

    private final class CapturingStreaming: StreamingClient, @unchecked Sendable {
        var endpoint: Endpoint?
        func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
            self.endpoint = endpoint
            return AsyncThrowingStream { $0.finish() }
        }
    }

    func testTheRequestCarriesTheStyleAsAnObject() throws {
        let streaming = CapturingStreaming()
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        _ = service.chatWithContext(messages: [MessagePayload(role: "user", content: "Chào")], userPreferences: nil,
                                    responseStyle: ["tone": "friendly", "length": "short"])
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(streaming.endpoint?.body)) as? [String: Any])
        let style = try XCTUnwrap(object["responseStyle"] as? [String: String], "an object, not a string: the server ignores a string")
        XCTAssertEqual(style, ["tone": "friendly", "length": "short"])
    }
}
