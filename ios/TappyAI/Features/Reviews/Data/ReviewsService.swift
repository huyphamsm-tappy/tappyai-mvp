import Foundation

struct ReviewsService: Sendable {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    // MARK: - Feed

    func fetchFeed(page: Int, sort: FeedSort, following: Bool, city: String? = nil) async throws -> FeedResponse {
        var query: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "12"),
            URLQueryItem(name: "sort", value: sort.rawValue),
        ]
        if following {
            query.append(URLQueryItem(name: "following", value: "true"))
        }
        if let city, !city.isEmpty {
            query.append(URLQueryItem(name: "city", value: city))
        }
        let endpoint = Endpoint(
            path: "/api/reviews/feed",
            method: .get,
            query: query,
            requiresAuth: following
        )
        return try await api.send(endpoint, as: FeedResponse.self)
    }

    // MARK: - Like toggle

    func toggleLike(reviewId: String) async throws -> LikeResponse {
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)/like",
            method: .post,
            requiresAuth: true
        )
        return try await api.send(endpoint, as: LikeResponse.self)
    }

    // MARK: - Save toggle

    func toggleSave(reviewId: String) async throws -> SaveResponse {
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)/save",
            method: .post,
            requiresAuth: true
        )
        return try await api.send(endpoint, as: SaveResponse.self)
    }

    // MARK: - Comments

    func fetchComments(reviewId: String, limit: Int = 30) async throws -> CommentsResponse {
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)/comments",
            method: .get,
            query: [URLQueryItem(name: "limit", value: "\(limit)")],
            requiresAuth: false
        )
        return try await api.send(endpoint, as: CommentsResponse.self)
    }

    func postComment(reviewId: String, body: String) async throws -> PostCommentResponse {
        let payload = try JSONSerialization.data(withJSONObject: ["body": body])
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)/comments",
            method: .post,
            body: payload,
            requiresAuth: true
        )
        return try await api.send(endpoint, as: PostCommentResponse.self)
    }

    func deleteComment(reviewId: String, commentId: String) async throws -> DeleteCommentResponse {
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)/comments",
            method: .delete,
            query: [URLQueryItem(name: "commentId", value: commentId)],
            requiresAuth: true
        )
        return try await api.send(endpoint, as: DeleteCommentResponse.self)
    }

    // MARK: - Follow toggle

    func toggleFollow(userId: String) async throws -> FollowResponse {
        let endpoint = Endpoint(
            path: "/api/users/\(userId)/follow",
            method: .post,
            requiresAuth: true
        )
        return try await api.send(endpoint, as: FollowResponse.self)
    }

    // MARK: - Delete review

    func deleteReview(reviewId: String) async throws {
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)",
            method: .delete,
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }

    // MARK: - Interact (watch-time signal, non-blocking)

    func interact(reviewId: String, watchSeconds: Int, completionRate: Double) async {
        let payload: [String: Any] = [
            "watch_seconds": watchSeconds,
            "completion_rate": completionRate
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)/interact",
            method: .post,
            body: body,
            requiresAuth: false
        )
        _ = try? await api.send(endpoint)
    }

    // MARK: - Hide review

    func hideReview(reviewId: String, hidden: Bool) async throws {
        let payload = try JSONSerialization.data(withJSONObject: ["is_hidden": hidden])
        let endpoint = Endpoint(
            path: "/api/reviews/\(reviewId)",
            method: .patch,
            body: payload,
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }
}
