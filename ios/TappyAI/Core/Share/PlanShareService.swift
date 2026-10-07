import Foundation

/// Publishing a plan: the ONE way this client obtains a `/plan/<shareId>` link.
///
/// iOS is a delivery client for the web brochure. It does not mint ids, hash snapshots or build
/// `/plan` URLs on its own — it sends the plan block to `POST /api/plans/share` under the current
/// session and turns the server's id into the canonical URL. The server is idempotent for the
/// same owner and plan, so sharing twice is safe and answers the same link; nothing is cached.
///
/// 🚨 SIGNED-IN ACCOUNTS ONLY, DECIDED BEFORE THE REQUEST. A link outlives a guest session, so the
/// route refuses anonymous sessions (403) and signed-out callers (401). `SessionStore.state` knows
/// both locally, so the plan is not sent at all in those cases — the sheet offers sign-in instead.
/// This mirrors, it does not replace, the server's own refusal.
enum PlanShareOutcome: Equatable, Sendable {
    /// Published: the canonical page for exactly this plan.
    case link(shareId: String, url: String)
    /// Signed out or a guest session: no request was made (or the server said 401/403).
    case signInRequired
    /// No network / timed out: nothing was published.
    case offline
    /// The plan could not be published (400/413): it is not a shareable plan.
    case notShareable
    /// The block this message carried is missing or not JSON.
    case noPlanPayload
    /// Server error, or a 200 whose body carried no usable id.
    case failed
}

/// What the route answers: `{ id, path, url, reused }`. Every field optional so a partial body
/// decodes and is then REJECTED on the id — a missing id is "no link", never a guessed one.
struct PlanSharePublishResponse: Decodable, Sendable {
    let id: String?
    let path: String?
    let url: String?
    let reused: Bool?
}

protocol PlanSharing: Sendable {
    func publish(planJSON: String) async -> PlanShareOutcome
}

struct PlanShareService: PlanSharing {
    let api: APIClient
    /// Whether the current session may publish — `SessionStore.state.isAuthenticated` (main-actor state).
    let isAuthenticated: @MainActor @Sendable () -> Bool

    func publish(planJSON: String) async -> PlanShareOutcome {
        guard await isAuthenticated() else { return .signInRequired }
        guard let body = Self.requestBody(planJSON: planJSON) else { return .noPlanPayload }
        let endpoint = Endpoint(path: "/api/plans/share", method: .post, body: body, requiresAuth: true)
        do {
            let response = try await api.send(endpoint, as: PlanSharePublishResponse.self)
            return Self.outcome(of: response)
        } catch let error as AppError {
            return Self.outcome(of: error)
        } catch {
            return .failed
        }
    }

    /// `{ "plan": <the block as one JSON object> }` — parsed once so it is well-formed, never
    /// re-modelled: fields `TappyPlan` does not carry (`photo_url`, the wire `label`/`items`)
    /// reach the server intact for it to whitelist.
    static func requestBody(planJSON: String) -> Data? {
        guard let data = planJSON.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let plan = object as? [String: Any] else { return nil }
        return try? JSONSerialization.data(withJSONObject: ["plan": plan])
    }

    /// A 200 is a link only when it carries a server id in the documented shape.
    static func outcome(of response: PlanSharePublishResponse) -> PlanShareOutcome {
        guard let id = response.id, let url = TappyShare.planShareURL(id) else { return .failed }
        return .link(shareId: id, url: url)
    }

    static func outcome(of error: AppError) -> PlanShareOutcome {
        switch error {
        case .authentication: return .signInRequired
        case .network(let status, _):
            switch status {
            case 401, 403: return .signInRequired
            case 400, 413, 422: return .notShareable
            default: return .failed
            }
        case .validation: return .notShareable
        case .offline: return .offline
        case .cancellation, .streaming, .unexpected: return .failed
        }
    }
}
