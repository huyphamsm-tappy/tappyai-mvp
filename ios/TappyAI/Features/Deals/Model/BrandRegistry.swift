import Foundation

/// The partner brands the Deals screen shows with their OFFICIAL logo — the native mirror of the Web's
/// `src/config/brandRegistry.ts` (schema v1; `docs/architecture/BRAND_ASSETS.md` §14 gives this exact iOS mapping).
///
/// Source of truth: Web `origin/rc/web-uat` @ 56a26ae. Every value below is copied from that file, and each logo is the
/// Web's own file from `public/brands/` (imageset `brand-<id>`), never redrawn, traced or recoloured. `source` records
/// where the Web says that file came from. An entry here approves nothing by itself: `approvedSince` is the owner's date.
///
/// Fallback order (Web §8, identical on every platform): registry logo → the deal's own `logoImage` → the partner's
/// initial letter. Unknown partners resolve to `nil`, never to an error.
enum BrandBackground: String, Equatable, Sendable { case light, dark }

enum BrandCategory: String, Equatable, Sendable {
    case shopping, foodDelivery = "food-delivery", transport, travel
}

struct BrandDefinition: Equatable, Sendable {
    let id: String
    let displayName: String
    let aliases: [String]
    /// Optical size correction (Web: multiplier on the inner box, clamped to 1.15).
    let scale: Double
    let background: BrandBackground
    let category: BrandCategory
    let officialWebsite: String
    /// "svg" | "png".
    let assetType: String
    let source: String
    let approvedSince: String

    /// The asset-catalog name of this brand's logo.
    var assetName: String { "brand-\(id)" }
}

enum BrandRegistry {
    static let all: [BrandDefinition] = [
        BrandDefinition(id: "shopee", displayName: "Shopee", aliases: [], scale: 1, background: .light, category: .shopping,
                        officialWebsite: "https://shopee.vn", assetType: "svg",
                        source: "Wikimedia Commons — File:Shopee logo.svg (official vertical lockup)", approvedSince: "2026-07-31"),
        BrandDefinition(id: "shopeefood", displayName: "ShopeeFood", aliases: ["Shopee Food"], scale: 1, background: .light,
                        category: .foodDelivery, officialWebsite: "https://shopeefood.vn", assetType: "png",
                        source: "shopeefood.vn — site-served official logo (brand publishes no public SVG)", approvedSince: "2026-07-31"),
        BrandDefinition(id: "tiktok-shop", displayName: "TikTok Shop", aliases: ["TikTokShop"], scale: 1, background: .dark,
                        category: .shopping, officialWebsite: "https://shop.tiktok.com", assetType: "png",
                        source: "TikTok seller-center CDN (oecstatic.com) — official lockup; white text is TikTok's brand standard, hence background: 'dark'",
                        approvedSince: "2026-07-31"),
        BrandDefinition(id: "grab", displayName: "Grab", aliases: [], scale: 1.05, background: .light, category: .transport,
                        officialWebsite: "https://www.grab.com/vn/", assetType: "svg",
                        source: "Wikimedia Commons — File:Grab Logo.svg", approvedSince: "2026-07-31"),
        BrandDefinition(id: "be", displayName: "Be", aliases: ["beVN", "Be Group"], scale: 0.92, background: .light, category: .transport,
                        officialWebsite: "https://be.com.vn", assetType: "svg",
                        source: "be.com.vn — official site theme asset (logo.svg)", approvedSince: "2026-07-31"),
        BrandDefinition(id: "agoda", displayName: "Agoda", aliases: [], scale: 1.1, background: .light, category: .travel,
                        officialWebsite: "https://www.agoda.com", assetType: "svg",
                        source: "Wikimedia Commons — File:Agoda Logo 2022.svg", approvedSince: "2026-07-31"),
        BrandDefinition(id: "booking", displayName: "Booking.com", aliases: ["Booking"], scale: 0.92, background: .light, category: .travel,
                        officialWebsite: "https://www.booking.com", assetType: "svg",
                        source: "Wikimedia Commons — File:Booking.com Icon 2022.svg (official \"B.\" app icon; the wordmark is illegible at 48px)",
                        approvedSince: "2026-07-31"),
    ]

    /// Web resolution contract: strip diacritics and punctuation, lower-case ("TikTok Shop" → `tiktokshop`).
    static func normalize(_ raw: String) -> String {
        let folded = raw.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "vi"))
            .replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
        return String(folded.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
    }

    private static let index: [String: BrandDefinition] = {
        var map: [String: BrandDefinition] = [:]
        for brand in all {
            for key in [brand.id, brand.displayName] + brand.aliases { map[normalize(key)] = brand }
        }
        return map
    }()

    /// The brand a partner name stands for, or nil (an unknown partner is a normal state).
    static func resolve(_ partnerName: String) -> BrandDefinition? {
        let key = normalize(partnerName)
        return key.isEmpty ? nil : index[key]
    }
}
