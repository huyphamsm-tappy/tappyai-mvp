import XCTest
@testable import TappyAI

/// The server's two link lines (web `systemLinkLines`) become tiles: partners first in the owner's order (Vexere, Agoda, Lazada), the rest as «more».
final class PartnerLinksTests: XCTestCase {
    private let answer = """
    Bạn đi từ TP.HCM đúng không?

    🔗 Liên kết đối tác: [Căn hộ FLC Beachfront — 331.049đ/đêm, kiểm tra lúc 18:53 · Agoda](https://www.agoda.com/a) · [Xem giá trên Vexere trang vé xe](https://vexere.com/x) · [Sản phẩm Lazada](https://www.lazada.vn/p)

    📎 Tham khảo thêm: [Xem giá trên Trip.com](https://trip.com/x) · [Xem giá trên Traveloka](https://traveloka.com/y)
    """

    func testTheLinkLinesLeaveTheTextAndComeBackAsLinks() {
        let r = PartnerLinks.extract(answer)
        XCTAssertEqual(r.text, "Bạn đi từ TP.HCM đúng không?")
        XCTAssertEqual(r.more.map(\.title), ["Xem giá trên Trip.com", "Xem giá trên Traveloka"])
        XCTAssertTrue(r.more.allSatisfy { $0.brand == .other })
    }

    func testPartnersAreOrderedVexereThenAgodaThenLazada() {
        let r = PartnerLinks.extract(answer)
        XCTAssertEqual(r.partners.map(\.brand), [.vexere, .agoda, .lazada])
        // the platform suffix the server appends is not repeated in the tile's title
        XCTAssertEqual(r.partners[1].title, "Căn hộ FLC Beachfront — 331.049đ/đêm, kiểm tra lúc 18:53")
        XCTAssertEqual(r.partners[1].brandName, "Agoda")
    }

    func testAnAnswerWithoutTheLinesIsUntouched() {
        let text = "Không có liên kết nào ở đây.\n\n- một\n- hai"
        XCTAssertEqual(PartnerLinks.extract(text), PartnerLinks.Extracted(text: text, partners: [], more: []))
    }

    func testAnUnsafeAddressIsDropped() {
        let r = PartnerLinks.extract("Xong.\n\n🔗 Liên kết đối tác: [Xấu · Agoda](javascript:alert(1)) · [Tốt · Agoda](https://www.agoda.com/ok)")
        XCTAssertEqual(r.partners.map(\.url), ["https://www.agoda.com/ok"])
    }

    func testTheEnglishLabelsAreRecognisedToo() {
        let r = PartnerLinks.extract("Done.\n\n🔗 Partner links: [Hotel · Agoda](https://www.agoda.com/h)\n\n📎 More options: [Trip.com](https://trip.com/t)")
        XCTAssertEqual(r.partners.count, 1)
        XCTAssertEqual(r.more.count, 1)
        XCTAssertEqual(r.text, "Done.")
    }

    func testALineInsideACodeBlockIsLeftAlone() {
        let text = "```\n🔗 Liên kết đối tác: [A · Agoda](https://www.agoda.com/a)\n```"
        XCTAssertTrue(PartnerLinks.extract(text).isEmpty)
    }
}
