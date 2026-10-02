import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// Reporting a commerce handoff from the client (CCP event 6) — iOS.
//
// When a user follows a Commerce Link, the click is the one CCP event the server cannot see. This
// posts the OPAQUE ids the platform minted to `POST /api/commerce/handoff` — never the URL, never
// anything about the person — exactly like web `reportCommerceHandoff` and Android
// `CommerceHandoffReporter`. Best-effort by contract: it is fired AFTER `UIApplication.open`, it
// never gates the link, and every failure is swallowed the way the web beacon's `.catch(() => {})`
// is. The four states the observability bridge distinguishes — rendered · tapped · handoff
// attempted · handoff failed — are logged through the app's logger so they can be told apart.
// ─────────────────────────────────────────────────────────────────────────────

/// The body the endpoint accepts (web `handoffBodyFor`): opaque ids + which client sent them.
struct CommerceHandoffBody: Codable, Equatable, Sendable {
    let linkId: String
    let requestId: String
    let platform: String

    init(linkId: String, requestId: String, platform: String = "ios") {
        self.linkId = linkId
        self.requestId = requestId
        self.platform = platform
    }
}

enum CommerceHandoffEvent: String, Sendable {
    case rendered = "commerce_action_rendered"
    case tapped = "commerce_action_tapped"
    case attempted = "commerce_handoff_attempted"
    case failed = "commerce_handoff_failed"
}

/// Seam for the beacon transport and the local event sink, so the reporter is testable without a
/// network. The app registers the real `APIClient`-backed pair in `AppDependencies`.
protocol CommerceHandoffTransport: Sendable {
    func post(_ body: CommerceHandoffBody) async throws
}

protocol CommerceEventSink: Sendable {
    func record(_ event: CommerceHandoffEvent, providerId: String, capability: String?, depth: Int, loginRequired: Bool, reason: String?)
}

enum CommerceHandoffReporter {
    /// The body a tap sends for this action, or nil when it is not a commerce handoff.
    static func body(for commerce: LiveCommerceFacts?) -> CommerceHandoffBody? {
        guard let c = commerce, !c.linkId.isEmpty, !c.requestId.isEmpty else { return nil }
        return CommerceHandoffBody(linkId: c.linkId, requestId: c.requestId, platform: "ios")
    }

    /// The card drew a commerce action.
    static func rendered(_ commerce: LiveCommerceFacts, sink: CommerceEventSink) {
        sink.record(.rendered, providerId: commerce.providerId, capability: commerce.capability, depth: commerce.depth, loginRequired: commerce.loginRequired, reason: nil)
    }

    /// The user tapped it; `opened` is what `UIApplication.open` reported. Never throws, never blocks.
    static func tapped(_ commerce: LiveCommerceFacts, opened: Bool, transport: CommerceHandoffTransport, sink: CommerceEventSink) {
        sink.record(.tapped, providerId: commerce.providerId, capability: commerce.capability, depth: commerce.depth, loginRequired: commerce.loginRequired, reason: nil)
        guard opened else {
            sink.record(.failed, providerId: commerce.providerId, capability: commerce.capability, depth: commerce.depth, loginRequired: commerce.loginRequired, reason: "no_handler")
            return
        }
        sink.record(.attempted, providerId: commerce.providerId, capability: commerce.capability, depth: commerce.depth, loginRequired: commerce.loginRequired, reason: nil)
        guard let body = body(for: commerce) else { return }
        Task.detached(priority: .utility) {
            do {
                try await transport.post(body)
            } catch {
                sink.record(.failed, providerId: commerce.providerId, capability: commerce.capability, depth: commerce.depth, loginRequired: commerce.loginRequired, reason: "beacon")
            }
        }
    }
}

/// The real transport: `POST /api/commerce/handoff` through the shared `APIClient` (no auth needed).
struct APICommerceHandoffTransport: CommerceHandoffTransport {
    let api: APIClient

    func post(_ body: CommerceHandoffBody) async throws {
        let data = try ResponseDecoder.jsonEncoder.encode(body)
        let endpoint = Endpoint(path: "/api/commerce/handoff", method: .post, body: data, requiresAuth: false, timeout: 10)
        _ = try await api.send(endpoint)
    }
}

/// The real sink: the app logger, so the four states show up in the same place every other event does.
struct LoggingCommerceEventSink: CommerceEventSink {
    func record(_ event: CommerceHandoffEvent, providerId: String, capability: String?, depth: Int, loginRequired: Bool, reason: String?) {
        let suffix = reason.map { " reason=\($0)" } ?? ""
        AppLogger.chat.info("\(event.rawValue) provider=\(providerId) capability=\(capability ?? "-") depth=\(depth) login=\(loginRequired)\(suffix)")
    }
}
