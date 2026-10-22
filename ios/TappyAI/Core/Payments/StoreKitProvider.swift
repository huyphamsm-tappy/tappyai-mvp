import StoreKit
import UIKit

/// StoreKit 2 implementation of `PaymentProvider` (ADR-006).
/// All methods are `@MainActor` — StoreKit purchase sheets must be presented on the main thread.
@MainActor
final class StoreKitProvider: PaymentProvider {
    private let api: APIClient
    private let session: SessionStore?
    private var cachedProduct: Product?
    private let log = AppLogger.app

    init(api: APIClient, session: SessionStore? = nil) {
        self.api = api
        self.session = session
    }

    // MARK: - PaymentProvider

    func availableProduct() async throws -> AppProduct? {
        let products = try await Product.products(for: ProductCatalog.allProductIds)
        guard let p = products.first(where: { $0.id == ProductCatalog.proMonthlyId })
                   ?? products.first(where: { $0.id == ProductCatalog.momoMonthlyId })
                   ?? products.first else {
            log.info("StoreKit: none of \(ProductCatalog.allProductIds) found in App Store Connect")
            return nil
        }
        cachedProduct = p
        return AppProduct(id: p.id, displayName: p.displayName, displayPrice: p.displayPrice)
    }

    func purchase() async throws -> PurchaseResult {
        let product: Product
        if let cached = cachedProduct {
            product = cached
        } else {
            let loaded = try await Product.products(for: ProductCatalog.allProductIds)
            guard let p = loaded.first(where: { $0.id == ProductCatalog.proMonthlyId })
                       ?? loaded.first(where: { $0.id == ProductCatalog.momoMonthlyId })
                       ?? loaded.first else {
                throw AppError.unexpected(message: "No product found in App Store Connect")
            }
            cachedProduct = p
            product = p
        }

        var options: Set<Product.PurchaseOption> = []
        if let uid = session?.userId, let uuid = UUID(uuidString: uid) {
            options.insert(.appAccountToken(uuid))
        }

        let result = try await product.purchase(options: options)

        switch result {
        case .success(let verification):
            switch verification {
            case .verified(let transaction):
                await syncWithBackend(transaction, jwsRepresentation: verification.jwsRepresentation)
                await transaction.finish()
                return .success
            case .unverified(_, let error):
                log.error("StoreKit: unverified transaction: \(error.localizedDescription)")
                throw AppError.unexpected(message: "Unverified transaction: \(error.localizedDescription)")
            }
        case .pending:
            log.info("StoreKit: purchase pending (parental approval)")
            return .pending
        case .userCancelled:
            return .cancelled
        @unknown default:
            return .cancelled
        }
    }

    func restorePurchases() async throws -> Bool {
        try await AppStore.sync()
        var restored = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  ProductCatalog.allProductIds.contains(transaction.productID),
                  transaction.revocationDate == nil else { continue }
            await syncWithBackend(transaction, jwsRepresentation: result.jwsRepresentation)
            await transaction.finish()
            restored = true
        }
        log.info("StoreKit: restore — \(restored ? "active entitlement found" : "no active entitlement")")
        return restored
    }

    func openSubscriptionManagement() async {
        guard let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
            return
        }
        do {
            try await AppStore.showManageSubscriptions(in: scene)
        } catch {
            // Fallback: deep link to App Store subscriptions page
            if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                await UIApplication.shared.open(url)
            }
        }
    }

    // MARK: - Backend sync

    /// Notifies the backend of a verified transaction so the server can update the subscriptions
    /// table. Non-fatal on failure — the entitlement is re-synced on next launch or restore.
    private func syncWithBackend(_ transaction: Transaction, jwsRepresentation: String) async {
        do {
            let body = try JSONSerialization.data(withJSONObject: [
                "originalTransactionId": String(transaction.originalID),
                "transactionId": String(transaction.id),
                "expiresDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0.0,
                "productId": transaction.productID,
                "signedTransactionInfo": jwsRepresentation,
            ])
            let endpoint = Endpoint(
                path: "/api/iap/apple/verify",
                method: .post,
                body: body,
                requiresAuth: true
            )
            _ = try await api.send(endpoint)
            log.info("StoreKit: backend sync succeeded for txn \(transaction.id)")
        } catch {
            log.error("StoreKit: backend sync failed: \(error.localizedDescription)")
        }
    }
}
