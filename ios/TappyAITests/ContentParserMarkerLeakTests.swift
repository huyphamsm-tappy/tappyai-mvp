import XCTest
@testable import TappyAI

/// P0 REGRESSION — two marker-leak classes already fixed on Web and Android, still open on iOS.
///
/// `ChatMessageList` calls `ContentParser.parse(msg.content)` on EVERY render, including while the
/// reply is still streaming. That is the right architecture — it is why iOS never had Android's
/// persisted-marker bug — but it means any marker shape the parser does not recognise is rendered
/// to the user as raw text, live.
///
/// 1. `[CTA_BUTTONS]` — the bare form was anchored to end-of-content (`…\}\s*$`). The model emits
///    `[FOLLOWUPS]` after it, so the anchor fails, nothing is stripped, and once the followups line
///    is removed the CTA JSON is left in the visible text. Fixed on Web in #197 after being found
///    in a live production reply; iOS carried the identical pattern.
///
/// 2. `[TAPPY_SHOPPING]` — only the closed pair was matched, so the half-arrived
///    `[TAPPY_SHOPPING]{"v":1,"entit…` renders as raw JSON for the seconds it takes the rest to
///    stream in. This is the leak Android shipped and had to fix in vc10.
///
/// Both are fixes to the EXISTING parser — no new parser, model or card.
final class ContentParserMarkerLeakTests: XCTestCase {

    // MARK: - CTA followed by FOLLOWUPS (the Web #197 defect)

    private let ctaJSON = #"{"buttons":[{"label":"🛒 Shopee","type":"search","url":"https://shopee.vn/search?keyword=op+lung","primary":true},{"label":"📦 Lazada","type":"search","url":"https://www.lazada.vn/catalog/?q=op+lung","primary":false}]}"#

    func testCTABlockFollowedByFollowupsDoesNotLeak() {
        let reply = "Mình gợi ý hai nơi để so giá.\n[CTA_BUTTONS]\(ctaJSON)\n[FOLLOWUPS]Ốp nào chống sốc?|Có ốp trong suốt không?"

        let parsed = ContentParser.parse(reply)

        XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"), "the marker must never reach the user")
        XCTAssertFalse(parsed.text.contains("\"buttons\""), "no raw JSON may reach the user")
        XCTAssertFalse(parsed.text.contains("shopee.vn/search"), "no raw url may reach the user")
        XCTAssertEqual(parsed.text, "Mình gợi ý hai nơi để so giá.")
    }

    func testCTAButtonsStillDecodedWhenFollowupsTrailTheBlock() {
        let reply = "x\n[CTA_BUTTONS]\(ctaJSON)\n[FOLLOWUPS]a|b"
        let parsed = ContentParser.parse(reply)

        XCTAssertEqual(parsed.buttons.count, 2)
        XCTAssertEqual(parsed.buttons.first?.label, "🛒 Shopee")
        XCTAssertEqual(parsed.buttons.first?.url, "https://shopee.vn/search?keyword=op+lung")
        XCTAssertEqual(parsed.followups, ["a", "b"])
    }

    func testCTABlockAtEndOfContentStillWorks() {
        let parsed = ContentParser.parse("Đi thử nhé.\n[CTA_BUTTONS]\(ctaJSON)")

        XCTAssertEqual(parsed.text, "Đi thử nhé.")
        XCTAssertEqual(parsed.buttons.count, 2)
    }

    func testCTABlockFollowedByProseLeavesTheProseIntact() {
        let parsed = ContentParser.parse("Mở app nhé.\n[CTA_BUTTONS]\(ctaJSON)\nCòn gì nữa không?")

        XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"))
        XCTAssertTrue(parsed.text.contains("Còn gì nữa không?"))
        XCTAssertEqual(parsed.buttons.count, 2)
    }

    /// Brace matching must stop at the block's own closing brace, never run to the last `}` in the
    /// message — the trap a looser un-anchored regex falls into.
    func testTrailingProseContainingBracesIsNotSwallowed() {
        let reply = "Mở app nhé.\n[CTA_BUTTONS]\(ctaJSON)\nCú pháp là {\"key\": \"value\"} nhé."
        let parsed = ContentParser.parse(reply)

        XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"))
        XCTAssertTrue(parsed.text.contains("Cú pháp là {\"key\": \"value\"} nhé."))
    }

    /// A `}` inside a JSON string (a URL-encoded brace, a label) must not end the scan early.
    func testBracesInsideJSONStringsDoNotEndTheScan() {
        let json = #"{"buttons":[{"label":"Giá {khuyến mãi}","type":"search","url":"https://x.example/a?q=%7Bid%7D","primary":true}]}"#
        let parsed = ContentParser.parse("Xem nhé.\n[CTA_BUTTONS]\(json)\nGhi chú sau.")

        XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"))
        XCTAssertTrue(parsed.text.contains("Ghi chú sau."))
        XCTAssertEqual(parsed.buttons.first?.label, "Giá {khuyến mãi}")
    }

    func testUnclosedCTABlockNeverLeaksWhileStreaming() {
        let parsed = ContentParser.parse("Đang tìm…\n[CTA_BUTTONS]{\"buttons\":[{\"label\":\"Sho")

        XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"))
        XCTAssertFalse(parsed.text.contains("\"buttons\""))
        XCTAssertEqual(parsed.text, "Đang tìm…")
    }

    func testMalformedCTAPayloadIsStrippedEvenThoughNoButtonsDecode() {
        let parsed = ContentParser.parse("Trước.\n[CTA_BUTTONS]{not valid json}\nSau.")

        XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"))
        XCTAssertFalse(parsed.text.contains("not valid json"))
        XCTAssertTrue(parsed.buttons.isEmpty)
        XCTAssertTrue(parsed.text.contains("Sau."))
    }

    func testOrphanCTATagNeverShows() {
        XCTAssertFalse(ContentParser.parse("Xong. [CTA_BUTTONS]").text.contains("CTA_BUTTONS"))
        XCTAssertFalse(ContentParser.parse("Xong. [/CTA_BUTTONS]").text.contains("CTA_BUTTONS"))
    }

    // MARK: - TAPPY_SHOPPING mid-stream (the Android vc10 defect)

    private let shoppingJSON = #"{"v":1,"entities":[{"key":"a","config":"Ốp trong","matchesRequest":"khop","recommended":true,"priceLow":150000,"priceHigh":220000,"image":null,"offers":[{"seller":"Shopee","url":"https://shop/a","price":150000,"currency":"VND","condition":null}]}],"recommendation":null}"#

    func testUnclosedShoppingMarkerNeverLeaksRawJSONWhileStreaming() {
        // Exactly what the view renders on the frame before the closing tag arrives.
        let midStream = "Mình chọn ốp trong.\n[TAPPY_SHOPPING]{\"v\":1,\"entit"

        let parsed = ContentParser.parse(midStream)

        XCTAssertFalse(parsed.text.contains("TAPPY_SHOPPING"), "a half-arrived marker must not be shown")
        XCTAssertFalse(parsed.text.contains("\"v\":1"), "no raw JSON may be shown")
        XCTAssertEqual(parsed.text, "Mình chọn ốp trong.")
        XCTAssertNil(parsed.shopping, "an incomplete payload yields no card")
    }

    func testCompleteShoppingMarkerStillDecodes() {
        let parsed = ContentParser.parse("Mình chọn ốp trong.\n[TAPPY_SHOPPING]\(shoppingJSON)[/TAPPY_SHOPPING]")

        XCTAssertEqual(parsed.text, "Mình chọn ốp trong.")
        XCTAssertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        XCTAssertEqual(parsed.shopping?.entities.count, 1)
    }

    func testOrphanShoppingTagNeverShows() {
        XCTAssertFalse(ContentParser.parse("Xong. [/TAPPY_SHOPPING]").text.contains("TAPPY_SHOPPING"))
    }

    /// A reply carrying two markers must render ONE decision, and must not leave the second as raw
    /// JSON in the prose.
    func testDuplicateShoppingMarkersLeaveNoRawJSON() {
        let reply = "A\n[TAPPY_SHOPPING]\(shoppingJSON)[/TAPPY_SHOPPING]\nB\n[TAPPY_SHOPPING]\(shoppingJSON)[/TAPPY_SHOPPING]"
        let parsed = ContentParser.parse(reply)

        XCTAssertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        XCTAssertFalse(parsed.text.contains("\"entities\""))
        XCTAssertNotNil(parsed.shopping)
    }

    // MARK: - Untouched behaviour

    func testOrdinaryReplyIsUnchanged() {
        let prose = "Mình chọn Quán hủ tiếu thả - Dì Ba — 4.6⭐ (57 đánh giá)."
        XCTAssertEqual(ContentParser.parse(prose).text, prose)
    }

    /// iOS renders markdown with Apple's own parser, which already handles a link inside bold. This
    /// is the Android defect (a hand-rolled renderer) and it does NOT apply here — locked so nobody
    /// "ports the Android fix" and replaces a working renderer.
    func testNestedBoldLinkRendersWithoutRawMarkdown() {
        let rendered = ContentParser.renderMarkdown("Mình chọn **[Golden Line Hotel](https://booking.com/x)** — gần sân bay.")
        let plain = String(rendered.characters)

        XCTAssertFalse(plain.contains("]("), "no raw markdown may reach the user")
        XCTAssertFalse(plain.contains("booking.com"), "the url must not be shown as text")
        XCTAssertTrue(plain.contains("Golden Line Hotel"))
    }
}
