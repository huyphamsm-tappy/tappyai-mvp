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
    /// Where the paid plan came from: `"apple"` (an App Store subscription) or `"external"` (anything else, e.g. a
    /// plan bought outside the app). Absent for Free/guest and from a server that predates the field.
    let source: String?

    /// Only an App Store subscription has a renewal date the app may state and a «Manage» screen at Apple.
    /// A plan the server says is `"external"` is shown plainly (Guideline 3.1.3(b): honest about what it is).
    /// An ABSENT `source` is a server that predates the field: every paid plan it knew was an App Store one (no other
    /// payment is switched on in production), so it keeps the App Store display and the app works against either server.
    var isAppleSubscription: Bool { isPro && (source == "apple" || source == nil) }

    /// The Free card is marked «Current plan» only while the account is on Free. Any paid plan, from the App Store or
    /// bought elsewhere, is the current plan instead: the Free card must not claim it too.
    var freePlanIsCurrent: Bool { !isPro }

    /// The Free card is drawn only for a Free account. With any paid plan (App Store or bought elsewhere) it is hidden
    /// entirely: the screen shows the banner, the Pro card, Restore and the terms.
    var showsFreeCard: Bool { !isPro }

    // Lenient on FORM (numbers as strings), strict on meaning: the quota numbers are what the
    // screen shows, so a response without them fails and the caller falls back to `.free` —
    // inventing "0 / 0" would state a quota the server never sent. `isPro` absent = not Pro,
    // the most restrictive reading.
    enum CodingKeys: String, CodingKey { case isPro, status, currentPeriodEnd, freeDailyLimit, todayMessageCount, remaining, source }
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
        source = c.lenient(String.self, forKey: .source)
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
