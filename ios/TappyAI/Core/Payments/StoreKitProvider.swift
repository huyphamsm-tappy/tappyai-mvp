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
    /// Long-lived listener for transactions that StoreKit delivers outside the purchase sheet:
    /// renewals, Ask to Buy approvals, purchases made on another device, and unfinished transactions
    /// redelivered after a launch. Created once per provider (the provider lives with the app).
    private var updatesTask: Task<Void, Never>?

    init(api: APIClient, session: SessionStore? = nil) {
        self.api = api
        self.session = session
        self.updatesTask = listenForTransactionUpdates()
    }

    // MARK: - PaymentProvider

    func availableProduct() async throws -> AppProduct? {
        if let cached = cachedProduct, cached.id == ProductCatalog.proMonthlyId {
            return AppProduct(id: cached.id, displayName: cached.displayName, displayPrice: cached.displayPrice)
        }
        // A thrown error is recorded once, by SubscriptionView.loadProduct.
        let started = Date()
        DiagnosticSnapshot.shared.record("StoreKit request start id=\(ProductCatalog.proMonthlyId)")
        let products = try await Product.products(for: [ProductCatalog.proMonthlyId])
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        DiagnosticSnapshot.shared.record("StoreKit request returned count=\(products.count) ids=\(products.map(\.id)) ms=\(ms)")
        guard let p = products.first(where: { $0.id == ProductCatalog.proMonthlyId }) else {
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
            let loaded = try await Product.products(for: [ProductCatalog.proMonthlyId])
            guard let p = loaded.first(where: { $0.id == ProductCatalog.proMonthlyId }) else {
                throw AppError.unexpected(message: "Không tìm thấy sản phẩm \(ProductCatalog.proMonthlyId) trong App Store Connect")
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
                // Finish only after the backend accepted the transaction. If the sync failed, the
                // transaction stays unfinished and StoreKit redelivers it on a later launch.
                let settled = await Self.settle(
                    sync: { await syncWithBackend(transaction, jwsRepresentation: verification.jwsRepresentation) },
                    finish: { await transaction.finish() })
                guard settled else {
                    log.error("StoreKit: purchase verified but backend sync failed; transaction left unfinished")
                    return .pending
                }
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
            guard await Self.settle(
                sync: { await syncWithBackend(transaction, jwsRepresentation: result.jwsRepresentation) },
                finish: { await transaction.finish() }) else { continue }
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

    /// Listens for transactions StoreKit delivers outside the purchase sheet. Each one is verified by
    /// StoreKit, checked against our product IDs, and synced to the backend before it is finished.
    /// The backend verify route is idempotent per originalTransactionId, so a transaction seen both here
    /// and in the purchase flow does not grant anything twice.
    private func listenForTransactionUpdates() -> Task<Void, Never> {
        Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handleTransactionUpdate(result)
            }
        }
    }

    private func handleTransactionUpdate(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result,
              ProductCatalog.allProductIds.contains(transaction.productID) else {
            log.info("StoreKit: transaction update ignored (unverified or unknown product)")
            return
        }
        // Unfinished on failure: StoreKit redelivers it, so a signed-out or offline launch retries later.
        _ = await Self.settle(
            sync: { await syncWithBackend(transaction, jwsRepresentation: result.jwsRepresentation) },
            finish: { await transaction.finish() })
    }

    /// THE rule for every path that receives a verified transaction (purchase sheet, restore, `Transaction.updates`):
    /// tell the backend first and `finish()` only when it accepted. A transaction that is finished before the server
    /// has it is gone from StoreKit's redelivery queue, and the person would have paid for a plan that never unlocks.
    /// Returns whether the transaction was synced and finished.
    static func settle(sync: () async -> Bool, finish: () async -> Void) async -> Bool {
        guard await sync() else { return false }
        await finish()
        return true
    }

    /// Notifies the backend of a verified transaction so the server can update the subscriptions
    /// table. Returns true only when the backend accepted it. Callers finish the transaction only on true.
    private func syncWithBackend(_ transaction: Transaction, jwsRepresentation: String) async -> Bool {
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
            return true
        } catch {
            log.error("StoreKit: backend sync failed: \(error.localizedDescription)")
            return false
        }
    }
}
