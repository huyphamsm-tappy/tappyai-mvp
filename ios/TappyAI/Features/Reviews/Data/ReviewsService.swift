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

    // MARK: - People search

    /// `GET /api/users/search?q=` — the people search Web and Android both have and iOS did not.
    ///
    /// The server enforces a 2-character minimum and returns an empty list below it; that check is
    /// mirrored here so a one-character query costs nothing rather than a round trip that can only
    /// come back empty. `requiresAuth` because `is_following` is computed for the CALLER — an
    /// anonymous request would get a result set whose follow state is meaningless.
    func searchUsers(query: String) async throws -> [UserSearchResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }
        let endpoint = Endpoint(
            path: "/api/users/search",
            method: .get,
            query: [URLQueryItem(name: "q", value: trimmed)],
            requiresAuth: true
        )
        return try await api.send(endpoint, as: UserSearchResponse.self).users
    }

    // MARK: - The author's own posts

    /// `GET /api/reviews/mine` — every post this user has made, INCLUDING ones they hid and ones
    /// the safety gate did not publish.
    ///
    /// A separate endpoint from the feed, not a feed parameter, and the difference matters:
    /// `/api/reviews/feed?userId=` excludes hidden rows even for their owner, so it can never be
    /// the author's own view. This route is self-scoped server-side from the verified session, so
    /// there is no caller-supplied id to get wrong.
    ///
    /// 🚨 This is the ONLY endpoint that returns `Review.moderation` for every row, which is what
    /// tells an author WHY a post of theirs is not public. Without it the composer's one-time
    /// notice is the only place they are ever told, and it is gone as soon as it is dismissed.
    func fetchMyReviews() async throws -> FeedResponse {
        let endpoint = Endpoint(path: "/api/reviews/mine", method: .get, requiresAuth: true)
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
