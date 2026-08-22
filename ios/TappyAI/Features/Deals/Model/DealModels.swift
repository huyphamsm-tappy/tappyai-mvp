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
}
