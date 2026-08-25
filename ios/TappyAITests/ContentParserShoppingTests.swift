import XCTest
@testable import TappyAI

/// The [TAPPY_SHOPPING] marker is the DURABLE delivery channel for the shopping decision (Web
/// parity). These lock: the marker is decoded, stripped from the visible text (no raw JSON leak),
/// and missing fields stay nil (never a fabricated number).
final class ContentParserShoppingTests: XCTestCase {

    private let marker = """
    [TAPPY_SHOPPING]{"v":1,"entities":[\
    {"key":"m1","config":"M1 · 32GB · 512GB","matchesRequest":"khop","recommended":true,\
    "priceLow":25800000,"priceHigh":27500000,"image":"https://cdn/x.jpg","offers":[\
    {"seller":"Zin100","url":"https://shop/zin","price":25800000,"currency":"VND","condition":null},\
    {"seller":"Tín Phát","url":"https://shop/tin","price":27500000,"currency":"VND","condition":null}]},\
    {"key":"m1pro","config":"M1 Pro · 16GB · 512GB","matchesRequest":"khac","recommended":false,\
    "priceLow":24999000,"priceHigh":24999000,"image":null,"offers":[\
    {"seller":"Lâm Phong","url":"https://shop/lam","price":24999000,"currency":"VND","condition":null}]}],\
    "recommendation":{"entityKey":"m1","seller":"Zin100",\
    "reasons":[{"attribute":"rating","evidence":"đánh giá 4.7/5"}],\
    "tradeOff":{"attribute":"gia","evidence":"Tín Phát rẻ hơn"},"conditional":false}}[/TAPPY_SHOPPING]
    """

    func testMarkerDecodedAndStrippedFromVisibleText() {
        let reply = "Mình gợi ý cấu hình này cho bạn.\n\n" + marker
        let parsed = ContentParser.parse(reply)
        // 1) marker parsed
        let s = try XCTUnwrap(parsed.shopping)
        XCTAssertEqual(s.entities.count, 2)
        // 2) marker removed from visible text — no raw JSON leak
        XCTAssertEqual(parsed.text, "Mình gợi ý cấu hình này cho bạn.")
        XCTAssertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        XCTAssertFalse(parsed.text.contains("priceLow"))
    }

    func testRecommendedEntityAndOffersAndAlternatives() {
        let s = try! XCTUnwrap(ContentParser.parse(marker).shopping)
        let recommended = s.entities.filter { $0.recommended }
        XCTAssertEqual(recommended.count, 1)                       // one primary recommendation
        XCTAssertEqual(recommended.first?.key, "m1")
        XCTAssertEqual(recommended.first?.offers.count, 2)         // recommended offer + one more
        XCTAssertEqual(recommended.first?.offers.map { $0.seller }, ["Zin100", "Tín Phát"])
        let others = s.entities.filter { !$0.recommended }
        XCTAssertEqual(others.count, 1)                            // meaningful alternative present
        XCTAssertEqual(others.first?.matchesRequest, "khac")
        XCTAssertEqual(s.recommendation?.reasons.first?.evidence, "đánh giá 4.7/5")
        XCTAssertEqual(s.recommendation?.tradeOff?.evidence, "Tín Phát rẻ hơn")
    }

    func testUnknownFieldsStayNil() {
        // A row with no price / condition and an entity with no image: missing stays nil, never 0.
        let bare = """
        [TAPPY_SHOPPING]{"v":1,"entities":[{"key":"u","config":"M2 · RAM ? · storage ?",\
        "matchesRequest":"chua_ro","recommended":true,"priceLow":null,"priceHigh":null,"image":null,\
        "offers":[{"seller":null,"url":null,"price":null,"currency":null,"condition":null}]}],\
        "recommendation":null}[/TAPPY_SHOPPING]
        """
        let s = try! XCTUnwrap(ContentParser.parse(bare).shopping)
        let e = s.entities[0]
        XCTAssertNil(e.priceLow); XCTAssertNil(e.priceHigh); XCTAssertNil(e.image)
        let o = e.offers[0]
        XCTAssertNil(o.price); XCTAssertNil(o.seller); XCTAssertNil(o.url); XCTAssertNil(o.condition)
        XCTAssertNil(s.recommendation)
    }

    func testEmptyEntitiesFallsBackToNoCard() {
        let reply = "x [TAPPY_SHOPPING]{\"v\":1,\"entities\":[],\"recommendation\":null}[/TAPPY_SHOPPING]"
        let parsed = ContentParser.parse(reply)
        XCTAssertNil(parsed.shopping)
        XCTAssertFalse(parsed.text.contains("TAPPY_SHOPPING"))
    }

    func testMalformedMarkerNeverThrowsAndIsStripped() {
        let reply = "Trước.[TAPPY_SHOPPING]{not json[/TAPPY_SHOPPING]Sau."
        let parsed = ContentParser.parse(reply)
        XCTAssertNil(parsed.shopping)
        XCTAssertFalse(parsed.text.contains("TAPPY_SHOPPING"))
    }

    func testNoMarkerIsPassthrough() {
        let parsed = ContentParser.parse("Chỉ là văn bản thường.")
        XCTAssertNil(parsed.shopping)
        XCTAssertEqual(parsed.text, "Chỉ là văn bản thường.")
    }
}
