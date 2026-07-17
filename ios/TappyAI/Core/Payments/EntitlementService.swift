import Foundation

/// The user's access tier. The backend is the source of truth (docs/ios/03, ADR-006).
enum Entitlement: String, Sendable, Equatable {
    case free, pro
}

/// Reads the entitlement from the backend. This is the ONLY payment surface shipped in the MVP —
/// a read-only seam. No StoreKit provider / purchase UI exists while Pro is gated OFF
/// (`SHOW_PRO_UPGRADE=false`). The StoreKit provider is deferred (ADR-006 amendment).
protocol EntitlementService: Sendable {
    func current() async -> Entitlement
}

/// Subscription status payload from `GET /api/subscription`.
/// Used by both `ServerEntitlementService` and `SubscriptionView`.
struct SubscriptionStatusResponse: Decodable, Sendable {
    let isPro: Bool
    let status: String?
    let currentPeriodEnd: String?
    let freeDailyLimit: Int
    let todayMessageCount: Int
    let remaining: Int
}

/// Reads server entitlement via `GET /api/subscription`. Returns `.free` on any error so the
/// client defaults to the most restrictive tier — enforcement always happens server-side.
struct ServerEntitlementService: EntitlementService {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func current() async -> Entitlement {
        do {
            let endpoint = Endpoint(path: "/api/subscription", method: .get, requiresAuth: true)
            let data = try await api.send(endpoint)
            let response = try ResponseDecoder.json.decode(SubscriptionStatusResponse.self, from: data)
            return response.isPro ? .pro : .free
        } catch {
            return .free
        }
    }
}
