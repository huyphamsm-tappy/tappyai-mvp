import XCTest
import UIKit
@testable import TappyAI

/// The Deals brand logos and links, matched to the Web (`src/config/brandRegistry.ts`, `partnerDeals.ts`, `DealsView.tsx`
/// at origin/rc/web-uat 56a26ae).
final class BrandRegistryTests: XCTestCase {

    func testTheSevenWebPartnersResolveByNameIdAndAlias() {
        let names: [(String, String)] = [
            ("Shopee", "shopee"), ("ShopeeFood", "shopeefood"), ("Shopee Food", "shopeefood"),
            ("TikTok Shop", "tiktok-shop"), ("TikTokShop", "tiktok-shop"), ("tiktok-shop", "tiktok-shop"),
            ("Grab", "grab"), ("Be", "be"), ("beVN", "be"), ("Be Group", "be"),
            ("Agoda", "agoda"), ("Booking.com", "booking"), ("Booking", "booking"),
        ]
        for (name, id) in names {
            XCTAssertEqual(BrandRegistry.resolve(name)?.id, id, name)
        }
    }

    func testAnUnknownOrEmptyPartnerIsNilNotAnError() {
        XCTAssertNil(BrandRegistry.resolve("Lazada"))
        XCTAssertNil(BrandRegistry.resolve(""))
        XCTAssertNil(BrandRegistry.resolve("  ..  "))
    }

    func testEveryRegistryEntryHasItsLogoInTheBundle() {
        XCTAssertEqual(BrandRegistry.all.count, 7)
        for brand in BrandRegistry.all {
            XCTAssertNotNil(UIImage(named: brand.assetName), "logo asset \(brand.assetName) is missing from the app")
            XCTAssertFalse(brand.source.isEmpty, "\(brand.id): the provenance of the file is recorded")
            XCTAssertLessThanOrEqual(brand.scale, 1.15)
        }
    }

    func testRegistryKeysDoNotCollide() {
        var seen = Set<String>()
        for brand in BrandRegistry.all {
            for key in [brand.id, brand.displayName] + brand.aliases {
                let n = BrandRegistry.normalize(key)
                if BrandRegistry.resolve(key)?.id == brand.id { seen.insert(n) }
                XCTAssertEqual(BrandRegistry.resolve(key)?.id, brand.id, "\(key) resolves to another brand")
            }
        }
        XCTAssertFalse(seen.isEmpty)
    }

    // MARK: - Links

    func testOnlyAnHttpsUrlWithAHostOpens() {
        XCTAssertEqual(DealLink.url(from: "https://shopee.vn")?.absoluteString, "https://shopee.vn")
        XCTAssertEqual(DealLink.url(from: "  https://www.grab.com/vn/ ")?.absoluteString, "https://www.grab.com/vn/")
        for bad in ["", "   ", "http://shopee.vn", "javascript:alert(1)", "tel:+84123456789", "mailto:a@b.c",
                    "tappyai://x", "ftp://x.vn", "https://", "https:///nohost", "shopee.vn", "https://sho pee.vn", "https://a.vn/\u{0007}"] {
            XCTAssertNil(DealLink.url(from: bad), "must not open: \(bad)")
        }
    }

    func testTheOfficialUrlIsOpenedUnchanged() {
        // No affiliate parameter, no rewriting: what the feed says is what opens (the Web card is a plain link).
        let url = DealLink.url(from: "https://www.agoda.com/vi-vn")
        XCTAssertEqual(url?.absoluteString, "https://www.agoda.com/vi-vn")
        XCTAssertNil(url?.query)
    }
}
