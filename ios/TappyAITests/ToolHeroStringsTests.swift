import XCTest
@testable import TappyAI

/// Smart Tools parity (UAT build 129): every Web tool page opens with a hero (eyebrow, title, sentence, chips). The wording is the Web's
/// (`src/lib/i18n/w3/{translate,currency,splitBill,scan,fortune}.ts`, origin/p7/web-subscription 12db1a2).
final class ToolHeroStringsTests: XCTestCase {

    private func string(_ key: String, _ lang: String) throws -> String {
        let path = try XCTUnwrap(Bundle.main.path(forResource: lang, ofType: "lproj"))
        let value = try XCTUnwrap(Bundle(path: path)).localizedString(forKey: key, value: "MISSING", table: nil)
        XCTAssertNotEqual(value, "MISSING", "\(key) [\(lang)]")
        return value
    }

    func testTheHeroWordingIsTheWebs() throws {
        let rows: [(String, String, String)] = [
            ("translate.heroEyebrow", "vi", "Dịch ngôn ngữ tức thì"),
            ("translate.heroTitle2", "en", "through language"),
            ("currency.heroSubtitle", "vi", "Tỷ giá cập nhật hàng giờ từ nguồn công khai"),
            ("currency.chipSource", "en", "Source: open.er-api.com"),
            ("splitBill.heroSubtitle", "vi", "Chia sẻ dễ dàng, thanh toán công bằng"),
            ("splitBill.chipModes", "en", "Split evenly or by item"),
            ("scan.heroTitle1", "vi", "Biến hình ảnh thành"),
            ("scan.heroEyebrow", "en", "TappyAI OCR"),
            ("fortune.heroEyebrow", "vi", "Xem bói online 🔮"),
            ("fortune.heroTitleLine2", "en", "has in store for you?"),
        ]
        for (key, lang, want) in rows { XCTAssertEqual(try string(key, lang), want, "\(key) [\(lang)]") }
    }

    func testTheCountsAreFilledIn() throws {
        XCTAssertEqual(String(format: try string("translate.heroBody", "en"), 12), "Fast, smooth translation into 12 languages.")
        XCTAssertEqual(String(format: try string("currency.chipCurrencies", "vi"), 14), "14 loại tiền tệ")
        XCTAssertEqual(String(format: try string("splitBill.chipPeople", "vi"), 2, 20), "2–20 người")
        XCTAssertEqual(String(format: try string("splitBill.chipPeople", "en"), 2, 20), "2–20 people")
    }

    func testTheCountsTheHeroesShowAreTheRealOnes() {
        XCTAssertGreaterThan(supportedLanguages.count, 1)
        XCTAssertGreaterThan(supportedCurrencies.count, 1)
    }
}
