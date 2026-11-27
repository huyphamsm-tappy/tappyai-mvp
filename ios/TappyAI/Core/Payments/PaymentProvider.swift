import Foundation

/// An App Store product available for purchase.
struct AppProduct: Sendable {
    let id: String
    let displayName: String
    let displayPrice: String
}

/// Outcome of a `PaymentProvider.purchase()` call.
enum PurchaseResult: Sendable {
    case success
    case cancelled
    case pending
}

/// Abstract payment operations. Concrete implementation: `StoreKitProvider`.
/// The rest of the app never imports StoreKit directly (ADR-006 Payment Abstraction Layer).
protocol PaymentProvider: AnyObject {
    @MainActor func availableProduct() async throws -> AppProduct?
    /// The sold plans the App Store served (`ProductCatalog.saleProductIds`), in the catalog's order; a plan the store did not serve is absent.
    @MainActor func availableProducts() async throws -> [AppProduct]
    @MainActor func purchase() async throws -> PurchaseResult
    /// Buys one of the sold plans.
    @MainActor func purchase(productId: String) async throws -> PurchaseResult
    @MainActor func restorePurchases() async throws -> Bool
    @MainActor func openSubscriptionManagement() async
}
