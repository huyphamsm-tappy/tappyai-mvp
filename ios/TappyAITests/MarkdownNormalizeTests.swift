import XCTest
@testable import TappyAI

/// The same cases as web `markdownNormalize.test.ts` (and Android's twin): the shapes that put a literal «**» on screen.
final class MarkdownNormalizeTests: XCTestCase {
    private func bold(_ s: String) -> String { MarkdownNormalize.balanceBold(s) }

    func testKeepsAMatchedPair() { XCTAssertEqual(bold("Quán **Phở Gà** ngon"), "Quán **Phở Gà** ngon") }

    func testDropsAnOrphan() {
        XCTAssertEqual(bold("Giá tốt nhất **"), "Giá tốt nhất ")
        XCTAssertEqual(bold("**Tổng ước tính"), "Tổng ước tính")
    }

    func testDropsTheUnmatchedOneAndKeepsTheRealPair() {
        XCTAssertEqual(bold("**a** và **b"), "**a** và b")
        XCTAssertEqual(bold("a** b **c** d"), "a b **c** d")
    }

    func testTrimsInnerPadding() {
        XCTAssertEqual(bold("** text**"), "**text**")
        XCTAssertEqual(bold("**text **"), "**text**")
    }

    func testTripleStarIsOneDelimiter() {
        XCTAssertEqual(bold("***Đà Lạt***"), "**Đà Lạt**")
        XCTAssertEqual(bold("**Lưu ý:*** abc"), "**Lưu ý:** abc")
        XCTAssertEqual(bold("***"), "")
    }

    func testEmptyPairsAndLongRunsGo() {
        XCTAssertEqual(bold("a **** b"), "a b")
        XCTAssertEqual(bold("a ** ** b"), "a b")
    }

    func testTheCardFieldShape() {
        XCTAssertEqual(bold("**4.7⭐"), "4.7⭐")
        XCTAssertEqual(bold("**4.7⭐**"), "**4.7⭐**")
    }

    func testNestedOrUnbalancedNeverLeavesAnOddRun() {
        for s in ["**a **b** c**", "**a **b", "****x", "x**y**z**", "** ** **"] {
            let out = bold(s)
            XCTAssertEqual(out.components(separatedBy: "**").count - 1 & 1, 0, "\(s) → \(out)")
        }
    }

    func testASingleStarOrTextWithoutBoldIsUntouched() {
        XCTAssertEqual(bold("2*3 = 6"), "2*3 = 6")
        XCTAssertEqual(bold("*nghiêng*"), "*nghiêng*")
    }

    func testPerLine() {
        XCTAssertEqual(MarkdownNormalize.balanceBoldPerLine("**Ngày 1\nđi chơi**"), "Ngày 1\nđi chơi")
        XCTAssertEqual(MarkdownNormalize.balanceBoldPerLine("**A** ok\n**B"), "**A** ok\nB")
    }

    func testPlainTextForCardFields() {
        let p = MarkdownNormalize.plainText
        XCTAssertEqual(p("**4.7⭐**"), "4.7⭐")
        XCTAssertEqual(p("**4.7⭐"), "4.7⭐")
        XCTAssertEqual(p("Ăn **bún chả** ở `Hàng Mành`"), "Ăn bún chả ở Hàng Mành")
        XCTAssertEqual(p("## Ngày 1"), "Ngày 1")
        XCTAssertEqual(p("Xem [Booking](https://booking.com/x)"), "Xem Booking")
        XCTAssertEqual(p("*rất* đẹp, __ồn__"), "rất đẹp, ồn")
        XCTAssertEqual(p("***"), "")
        XCTAssertEqual(p("2*3 phòng"), "2*3 phòng")
        XCTAssertEqual(p("photo_url"), "photo_url")
    }

    func testTheReplyKeepsMarkersAndStripsTheirStrings() throws {
        let plan = #"{"type":"trip","title":"**Vũng Tàu**","days":[{"label":"Ngày 1","items":[{"time":"9:00","name":"Bãi Sau","description":"**4.7⭐","maps_link":"https://maps.google.com/?q=a"}]}]}"#
        let text = "**Gợi ý** cho bạn **\n[TAPPY_PLAN]\(plan)[/TAPPY_PLAN]\n[CTA_BUTTONS]{\"buttons\":[{\"label\":\"**Đặt**\",\"url\":\"https://x.vn/**\"}]}[/CTA_BUTTONS]\n[FOLLOWUPS]**Giá?|Còn quán khác?[/FOLLOWUPS]"
        let out = MarkdownNormalize.normalizeReply(text)
        XCTAssertTrue(out.hasPrefix("**Gợi ý** cho bạn \n[TAPPY_PLAN]"))
        let body = try XCTUnwrap(blockJSON(out, "TAPPY_PLAN") as? [String: Any])
        XCTAssertEqual(body["title"] as? String, "Vũng Tàu")
        let item = ((body["days"] as? [[String: Any]])?.first?["items"] as? [[String: Any]])?.first
        XCTAssertEqual(item?["description"] as? String, "4.7⭐")
        XCTAssertEqual(item?["maps_link"] as? String, "https://maps.google.com/?q=a", "an address is never rewritten")
        let cta = try XCTUnwrap(blockJSON(out, "CTA_BUTTONS") as? [String: Any])
        let button = (cta["buttons"] as? [[String: Any]])?.first
        XCTAssertEqual(button?["label"] as? String, "Đặt")
        XCTAssertEqual(button?["url"] as? String, "https://x.vn/**")
        XCTAssertTrue(out.contains("[FOLLOWUPS]Giá?|Còn quán khác?[/FOLLOWUPS]"))
    }

    func testACleanBlockIsByteIdenticalAndAnUnclosedOneIsNeverTouched() {
        let block = "[TAPPY_PLAN]\n{\"title\": \"x\", \"days\": []}\n[/TAPPY_PLAN]"
        XCTAssertEqual(MarkdownNormalize.normalizeReply("ok \(block)"), "ok \(block)")
        let cut = "Xin chào **\n[TAPPY_PLAN]{\"title\":\"**x"
        XCTAssertEqual(MarkdownNormalize.normalizeReply(cut), "Xin chào \n[TAPPY_PLAN]{\"title\":\"**x")
    }

    func testMalformedJsonInsideAClosedBlockIsLeftAsItIs() {
        let t = "[TAPPY_PLAN]{not json **[/TAPPY_PLAN]"
        XCTAssertEqual(MarkdownNormalize.normalizeReply(t), t)
    }

    func testHalfAccentedPriceWords() {
        XCTAssertEqual(MarkdownNormalize.fixHalfAccented("Ngan sách 2 triệu"), "Ngân sách 2 triệu")
        XCTAssertEqual(MarkdownNormalize.fixHalfAccented("ngân sach 2 triệu"), "ngân sách 2 triệu")
        XCTAssertEqual(MarkdownNormalize.fixHalfAccented("gia vé 100k"), "giá vé 100k")
        XCTAssertEqual(MarkdownNormalize.fixHalfAccented("gia đình"), "gia đình", "«gia» beside a non-price word is untouched")
        XCTAssertEqual(MarkdownNormalize.fixHalfAccented("ngan sach"), "ngan sach", "fully unaccented text may be deliberate")
    }

    func testTheParserNowHandsCardsTheCleanStrings() throws {
        let plan = #"{"type":"trip","title":"**Đà Lạt**","days":[{"label":"Ngày 1","items":[{"time":"9:00","emoji":"🏞️","category":"nature","name":"**Hồ Xuân Hương**","description":"**4.7⭐"}]}]}"#
        let parsed = ContentParser.parse("Mình xếp lịch **\n[TAPPY_PLAN]\(plan)[/TAPPY_PLAN]")
        XCTAssertEqual(parsed.plan?.title, "Đà Lạt")
        XCTAssertEqual(parsed.plan?.days.first?.items.first?.name, "Hồ Xuân Hương")
        XCTAssertEqual(parsed.plan?.days.first?.items.first?.description, "4.7⭐")
        XCTAssertFalse(parsed.text.contains("**"))
    }

    private func blockJSON(_ text: String, _ name: String) -> Any? {
        guard let re = try? NSRegularExpression(pattern: #"\[\#(name)\]([\s\S]*?)\[/\#(name)\]"#),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let r = Range(m.range(at: 1), in: text),
              let data = String(text[r]).data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }
}
