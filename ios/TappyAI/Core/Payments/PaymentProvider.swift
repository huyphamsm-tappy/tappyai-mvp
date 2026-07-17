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
    @MainActor func purchase() async throws -> PurchaseResult
    @MainActor func restorePurchases() async throws -> Bool
    @MainActor func openSubscriptionManagement() async
}
