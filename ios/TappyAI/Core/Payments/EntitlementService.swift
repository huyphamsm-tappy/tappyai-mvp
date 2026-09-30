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

    // Lenient on FORM (numbers as strings), strict on meaning: the quota numbers are what the
    // screen shows, so a response without them fails and the caller falls back to `.free` —
    // inventing "0 / 0" would state a quota the server never sent. `isPro` absent = not Pro,
    // the most restrictive reading.
    enum CodingKeys: String, CodingKey { case isPro, status, currentPeriodEnd, freeDailyLimit, todayMessageCount, remaining }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func number(_ key: CodingKeys) throws -> Int {
            guard let n = c.lenientInt(forKey: key) else {
                throw DecodingError.keyNotFound(key, .init(codingPath: c.codingPath, debugDescription: "quota number missing"))
            }
            return n
        }
        isPro = c.lenient(Bool.self, forKey: .isPro, default: false)
        status = c.lenient(String.self, forKey: .status)
        currentPeriodEnd = c.lenient(String.self, forKey: .currentPeriodEnd)
        freeDailyLimit = try number(.freeDailyLimit)
        todayMessageCount = try number(.todayMessageCount)
        remaining = try number(.remaining)
    }
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
