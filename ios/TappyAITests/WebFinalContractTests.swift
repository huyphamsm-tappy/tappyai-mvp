import XCTest
@testable import TappyAI

/// The client-facing contract of the Web final (`origin/p7/web-subscription` a43948d41684386a46857077b02b6f413e025d1f, code
/// identical to baseline 2a276ad; `docs/audit/CONSULTATIVE-FINAL-HANDOFF.md`). The Agent / Consultative logic is server-side;
/// these tests pin only what the phone consumes.
final class WebFinalContractTests: XCTestCase {

    // MARK: - CTA URL filter (Web `src/lib/structuredContent/parseCta.ts`)

    private func ctaReply(_ urls: [String]) -> String {
        let buttons = urls.enumerated().map { i, u in
            #"{"label":"B\#(i)","type":"website","url":\#(jsonString(u)),"primary":false}"#
        }.joined(separator: ",")
        return "Xong.\n[CTA_BUTTONS]{\"buttons\":[\(buttons)]}[/CTA_BUTTONS]"
    }

    private func jsonString(_ s: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [s], options: [])
        let arr = String(data: data, encoding: .utf8)!
        return String(arr.dropFirst().dropLast())   // the element without the brackets
    }

    func testTheWebAllowedCtaUrlsStay() {
        let allowed = ["https://shopee.vn/x", "http://example.vn", "HTTPS://Example.vn/Path", "tel:+84123456789", "mailto:a@b.vn",
                       "/chat", "/", "  https://trimmed.vn  "]
        let parsed = ContentParser.parseCTA(ctaReply(allowed))
        XCTAssertEqual(parsed.buttons.count, allowed.count, "every URL the Web keeps is kept")
    }

    func testTheWebDroppedCtaUrlsAreDropped() {
        let dropped = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html;base64,AAAA", "//evil.example/x", "/\\evil.example",
                       "ftp://x.vn", "tappyai://home", "https://exa mple.vn", "https://a.vn/\u{0007}", "", "   ", "www.example.vn", "vbscript:x"]
        let parsed = ContentParser.parseCTA(ctaReply(dropped + ["https://ok.vn"]))
        XCTAssertEqual(parsed.buttons.map(\.url), ["https://ok.vn"], "only the safe button survives")
        XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"), "the marker never leaks, whatever the buttons")
    }

    // MARK: - Plan budget (Agent prompt: `budget_total` = the figure the user stated; otherwise none)

    func testAPlanWithoutAStatedBudgetHasNoBudgetRowAndDoesNotCrash() throws {
        let noField = #"{"type":"trip","title":"Đà Lạt 2 ngày","people":2,"days":[{"label":"Ngày 1","items":[{"time":"09:00","emoji":"☕","category":"food","name":"Quán A","description":"Cà phê","price":"chưa có giá"}]}]}"#
        let sentinel = noField.replacingOccurrences(of: #""people":2,"#, with: #""people":2,"budget_total":"chưa có giá","#)
        for json in [noField, sentinel] {
            let plan = try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8))
            let card = PlanCardModel.of(plan)
            XCTAssertNil(card.overview.first { $0.kind == .budget }, "no budget row without a stated budget")
            XCTAssertEqual(card.days.first?.stops.count, 1)
            XCTAssertEqual(card.days.first?.stops.first?.price, PlanCardModel.noPrice, "a missing price keeps its sentinel, never a number")
        }
    }

    func testAStatedBudgetIsShownAsTheServerWroteIt() throws {
        let json = #"{"type":"trip","title":"Đà Nẵng","people":2,"budget_total":"6.000.000 VND","days":[{"label":"Ngày 1","items":[]}]}"#
        let card = PlanCardModel.of(try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8)))
        XCTAssertEqual(card.overview.first { $0.kind == .budget }?.value, "6.000.000 VND")
    }
}
