import Foundation

/// App Store product identifiers. Must match App Store Connect configuration exactly.
/// Enable `SHOW_PRO_UPGRADE` in /api/config after creating the product in App Store Connect.
enum ProductCatalog {
    /// Monthly Pro subscription — matches the product registered in App Store Connect.
    static let proMonthlyId = "com.tappyai.ios.pro.monthly"
}
