import XCTest
@testable import TappyAI

/// The apps panel of the QR / share card carries the Web's wording (`src/lib/i18n/v3/web.ts` `v3.qr.card.*`, p7 12db1a2: vi lines 405-408,
/// en lines 1096-1099). The copy the card renders comes from `CardCopy.string`.
final class QRCardAppsPanelStringsTests: XCTestCase {

    func testViWordingIsTheWebs() {
        XCTAssertEqual(CardCopy.string("share.card.orWebsite", lang: "vi"), "Hoặc truy cập website")
        XCTAssertEqual(CardCopy.string("share.card.appsTitle", lang: "vi"), "Tải ứng dụng TappyAI")
        XCTAssertEqual(CardCopy.string("share.card.androidSoon", lang: "vi"), "Android · Sắp có trên Google Play")
        XCTAssertEqual(CardCopy.string("share.card.iosSoon", lang: "vi"), "iOS · Sắp có trên App Store")
    }

    func testEnWordingIsTheWebs() {
        XCTAssertEqual(CardCopy.string("share.card.orWebsite", lang: "en"), "Or visit the website")
        XCTAssertEqual(CardCopy.string("share.card.appsTitle", lang: "en"), "Get the TappyAI app")
        XCTAssertEqual(CardCopy.string("share.card.androidSoon", lang: "en"), "Android · Coming soon to Google Play")
        XCTAssertEqual(CardCopy.string("share.card.iosSoon", lang: "en"), "iOS · Coming soon to the App Store")
    }
}
