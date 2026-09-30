import Foundation

/// The safety endpoints. All authenticated; each 404s while its server flag is off.
struct SafetyService: Sendable {
    let api: APIClient

    /// `POST /api/reports` — 200 `{ok:true}` (or `{ok:true, duplicate:true}` for a repeat of a report
    /// that is still open). 403 anonymous/restricted, 429 after 20 reports an hour, 404 flag off.
    func report(_ request: ReportRequest) async throws {
        let endpoint = Endpoint(path: "/api/reports", method: .post, body: try request.jsonBody(), requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    /// `POST /api/users/{id}/block` — 200 `{ok:true, blocked:true}`. The server also drops any follow
    /// between the two; it answers the same for an account that does not exist.
    func block(userId: String) async throws {
        _ = try await api.send(Endpoint(path: "/api/users/\(userId)/block", method: .post, requiresAuth: true))
    }

    /// `DELETE /api/users/{id}/block` — 200 `{ok:true, blocked:false}`.
    func unblock(userId: String) async throws {
        _ = try await api.send(Endpoint(path: "/api/users/\(userId)/block", method: .delete, requiresAuth: true))
    }

    /// `GET /api/users/blocks` — the caller's own list, newest first (≤ 500).
    func blocks() async throws -> [BlockEntry] {
        let endpoint = Endpoint(path: "/api/users/blocks", method: .get, requiresAuth: true)
        return try await api.send(endpoint, as: BlocksResponse.self).blocks
    }
}
