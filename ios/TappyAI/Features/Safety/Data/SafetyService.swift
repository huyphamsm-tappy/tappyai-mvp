import Foundation

/// The safety endpoints. All authenticated; each 404s while its server flag is off.
struct SafetyService: Sendable {
    let api: APIClient

    /// The server's final contract (no `POST /api/reports`): one route per target —
    /// `POST /api/reviews/{id}/report` (posts and clips), `POST /api/comments/{id}/report`,
    /// `POST /api/users/{id}/report`, body `{ reason, details? }`. 200 even when the target does not exist
    /// (shown as «sent»); any other status is «not sent», never «sent». 404 = flag off, 403 anonymous/restricted.
    func report(_ request: ReportRequest) async throws {
        let endpoint = Endpoint(path: Self.reportPath(kind: request.kind, targetId: request.targetId),
                                method: .post, body: try request.jsonBody(), requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    static func reportPath(kind: ReportTargetKind, targetId: String) -> String {
        switch kind {
        case .review: return "/api/reviews/\(targetId)/report"
        case .comment: return "/api/comments/\(targetId)/report"
        case .user: return "/api/users/\(targetId)/report"
        }
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
