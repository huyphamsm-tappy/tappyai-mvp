import XCTest
@testable import TappyAI

/// Locks the `GET /api/deals` contract (Production Knowledge Base §4/§10) — Deals moved from a
/// hardcoded client pool to a DB-backed table; this is the real current public shape.
final class DealModelsTests: XCTestCase {
    func testDecodesFullContract() throws {
        let json = """
        {"success":true,"deals":[{
            "id":"d1","partnerSlug":"shopee","partnerName":"Shopee","partnerType":"ecommerce",
            "category":"Mua sắm","categoryKey":"mua-sam","title":"Giảm 50%","description":"...",
            "officialUrl":"https://shopee.vn","bannerImage":null,"logoImage":"https://x/logo.png",
            "isFeatured":true,"discountLabel":"-50%","voucherCode":"TAPPY50","endAt":null
        }]}
        """
        let response = try ResponseDecoder.json.decode(DealsResponse.self, from: Data(json.utf8))
        XCTAssertTrue(response.success)
        let deal = try XCTUnwrap(response.deals.first)
        XCTAssertEqual(deal.partnerSlug, "shopee")
        XCTAssertEqual(deal.category, "Mua sắm")
        XCTAssertEqual(deal.categoryKey, "mua-sam")
        XCTAssertTrue(deal.isFeatured)
        XCTAssertEqual(deal.voucherCode, "TAPPY50")
    }

    /// `category` (localized) and `categoryKey` (stable) must decode to genuinely different
    /// values when the backend sends different strings — a badge-color mapping that accidentally
    /// keyed off `category` would silently "work" in a test that only used identical values.
    func testCategoryAndCategoryKeyAreIndependentFields() throws {
        let json = """
        {"id":"d1","partnerSlug":"grab","partnerName":"Grab","partnerType":"transport",
         "category":"Di chuyển","categoryKey":"di-chuyen","title":"T","description":null,
         "officialUrl":"https://grab.com","bannerImage":null,"logoImage":null,
         "isFeatured":false,"discountLabel":null,"voucherCode":null,"endAt":null}
        """
        let deal = try ResponseDecoder.json.decode(PartnerDeal.self, from: Data(json.utf8))
        XCTAssertNotEqual(deal.category, deal.categoryKey)
    }
}
