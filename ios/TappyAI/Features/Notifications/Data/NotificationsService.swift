import Foundation

/// `GET /api/notifications` / `POST /api/notifications/read` (ADR-014). Read path only pagination
/// is `limit`/`before` (no `page` — matches the backend's actual cursor-by-timestamp shape); mark-
/// read with no body marks every notification read, per the contract in the Production Knowledge Base.
final class NotificationsService: Sendable {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func fetchNotifications(limit: Int = 30, before: String? = nil) async throws -> NotificationsResponse {
        var query = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let before { query.append(URLQueryItem(name: "before", value: before)) }
        let endpoint = Endpoint(path: "/api/notifications", method: .get, query: query, requiresAuth: true)
        return try await api.send(endpoint, as: NotificationsResponse.self)
    }

    /// `id == nil` marks every notification read (no request body — matches the backend contract).
    func markRead(id: String? = nil) async throws {
        var body: Data?
        if let id {
            body = try JSONSerialization.data(withJSONObject: ["id": id])
        }
        let endpoint = Endpoint(path: "/api/notifications/read", method: .post, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }
}
