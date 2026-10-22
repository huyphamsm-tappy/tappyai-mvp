import Foundation

/// App Store product identifiers. Must match App Store Connect configuration exactly.
/// Enable `SHOW_PRO_UPGRADE` in /api/config after creating the product in App Store Connect.
enum ProductCatalog {
    /// Monthly Pro subscription — matches the product registered in App Store Connect.
    static let proMonthlyId = "com.tappyai.ios.pro.monthly"
    /// Monthly plan identifier from canonical catalog (Momo).
    static let momoMonthlyId = "tappy_momo_1m"
    /// All product IDs recognized by TappyAI In-App Purchases.
    static let allProductIds: [String] = [
        proMonthlyId,
        momoMonthlyId,
        "tappy_pip_1w",
        "tappy_coco_3m",
        "tappy_milo_6m",
        "tappy_sunny_12m"
    ]
}
