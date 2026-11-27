import Foundation

/// App Store product identifiers. Must match App Store Connect configuration exactly.
/// Enable `SHOW_PRO_UPGRADE` in /api/config after creating the product in App Store Connect.
enum ProductCatalog {
    /// Monthly Pro subscription — the product the app first shipped with. No longer sold, but a person who still holds it keeps it (Restore, renewals).
    static let proMonthlyId = "com.tappyai.ios.pro.monthly"
    /// Monthly plan identifier from canonical catalog (Momo).
    static let momoMonthlyId = "tappy_momo_1m"
    /// The 7-day Pip pack: a NON-renewing product, one per account for life (the server refuses a second one).
    static let pipId = "tappy_pip_1w"

    /// A plan sold in the app: the same five the web sells (`SALE_PLAN_IDS`), in the order the screen lists them. The name is the brand's own
    /// (the web shows the same names); the length is what the plan buys. The price is never here: it is the App Store's, per storefront.
    struct SalePlan: Equatable, Sendable {
        let productId: String
        let name: String
        /// What the length reads as on the screen (Vietnamese, like the web).
        let periodLabel: String
        /// True for the one product that does not renew.
        let isOneTime: Bool
    }

    static let salePlans: [SalePlan] = [
        // The names are the ones the web shows (planConfig labels): the stored id `pip` is the 7-day «MoMo» trial; «Pip» is the Free plan.
        SalePlan(productId: pipId, name: "MoMo", periodLabel: "7 ngày", isOneTime: true),
        SalePlan(productId: momoMonthlyId, name: "Coco", periodLabel: "1 tháng", isOneTime: false),
        SalePlan(productId: "tappy_coco_3m", name: "Coco", periodLabel: "3 tháng", isOneTime: false),
        SalePlan(productId: "tappy_promax_1m", name: "Tappy", periodLabel: "1 tháng", isOneTime: false),
        SalePlan(productId: "tappy_promax_3m", name: "Tappy", periodLabel: "3 tháng", isOneTime: false),
    ]

    /// The product ids the screen asks the App Store for.
    static var saleProductIds: [String] { salePlans.map(\.productId) }

    static func salePlan(for productId: String) -> SalePlan? { salePlans.first { $0.productId == productId } }

    /// All product IDs recognized by TappyAI In-App Purchases (Restore and transaction updates accept these). `proMonthlyId` stays first and the
    /// two plans that are no longer sold stay in the list so an older purchase is still recognized.
    static let allProductIds: [String] = [
        proMonthlyId,
        momoMonthlyId,
        pipId,
        "tappy_coco_3m",
        "tappy_promax_1m",
        "tappy_promax_3m",
        "tappy_milo_6m",
        "tappy_sunny_12m"
    ]
}
