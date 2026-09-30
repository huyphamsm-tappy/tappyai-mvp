import Foundation

/// Matches `GET /api/deals` (Production Knowledge Base §4/§10). Deals moved from a hardcoded
/// client-side catalog to a DB-backed table (`partner_deals` + `partner_deal_translations`) with
/// admin CRUD, localization, and click tracking — this is the current, real public contract.
struct PartnerDeal: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let partnerSlug: String
    let partnerName: String
    let partnerType: String
    /// Localized display label (follows `?lang=`).
    let category: String
    /// Stable Vietnamese-base key for styling — deliberately NEVER localized, so category color
    /// mapping doesn't break when the UI language changes (the exact bug Android hit and fixed).
    let categoryKey: String
    let title: String
    let description: String?
    let officialUrl: String
    let bannerImage: String?
    let logoImage: String?
    let isFeatured: Bool
    let discountLabel: String?
    let voucherCode: String?
    let endAt: String?
}

struct DealsResponse: Decodable, Sendable {
    let success: Bool
    let deals: [PartnerDeal]

    enum CodingKeys: String, CodingKey { case success, deals }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = c.lenient(Bool.self, forKey: .success, default: true)
        deals = c.lossyArray(PartnerDeal.self, forKey: .deals)
    }
}

/// Lenient: a deal needs an id, a title and somewhere to go; everything else has a neutral default.
extension PartnerDeal {
    enum CodingKeys: String, CodingKey {
        case id, partnerSlug, partnerName, partnerType, category, categoryKey, title, description
        case officialUrl, bannerImage, logoImage, isFeatured, discountLabel, voucherCode, endAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        officialUrl = try c.decode(String.self, forKey: .officialUrl)
        partnerSlug = c.lenient(String.self, forKey: .partnerSlug, default: "")
        partnerName = c.lenient(String.self, forKey: .partnerName, default: "")
        partnerType = c.lenient(String.self, forKey: .partnerType, default: "")
        category = c.lenient(String.self, forKey: .category, default: "")
        categoryKey = c.lenient(String.self, forKey: .categoryKey) ?? category
        description = c.lenient(String.self, forKey: .description)
        bannerImage = c.lenient(String.self, forKey: .bannerImage)
        logoImage = c.lenient(String.self, forKey: .logoImage)
        isFeatured = c.lenient(Bool.self, forKey: .isFeatured, default: false)
        discountLabel = c.lenient(String.self, forKey: .discountLabel)
        voucherCode = c.lenient(String.self, forKey: .voucherCode)
        endAt = c.lenient(String.self, forKey: .endAt)
    }
}
