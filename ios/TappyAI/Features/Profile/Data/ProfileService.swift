import Foundation

struct ProfileService {
    let api: APIClient

    // MARK: - Profile

    func fetchProfile() async throws -> UserProfile {
        let endpoint = Endpoint(path: "/api/profile", requiresAuth: true)
        return try await api.send(endpoint, as: UserProfile.self)
    }

    func updateProfile(fullName: String?, bio: String?) async throws {
        var payload: [String: String] = [:]
        if let fullName { payload["full_name"] = fullName }
        if let bio { payload["bio"] = bio }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let endpoint = Endpoint(path: "/api/profile", method: .patch, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    func updateLanguage(_ code: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["language": code])
        let endpoint = Endpoint(path: "/api/profile", method: .patch, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    func uploadAvatar(_ data: Data, boundary: String) async throws -> String? {
        let endpoint = Endpoint(
            path: "/api/profile",
            method: .post,
            body: data,
            requiresAuth: true,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        let resp = try await api.send(endpoint, as: AvatarUploadResponse.self)
        return resp.avatarUrl
    }

    // MARK: - Memory

    func fetchMemory() async throws -> MemoryResponse {
        let endpoint = Endpoint(path: "/api/memory", requiresAuth: true)
        return try await api.send(endpoint, as: MemoryResponse.self)
    }

    func patchMemory(_ patch: [String: Any]) async throws {
        let body = try JSONSerialization.data(withJSONObject: patch)
        let endpoint = Endpoint(path: "/api/memory", method: .patch, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    func clearMemory() async throws {
        let endpoint = Endpoint(path: "/api/memory", method: .delete, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    // MARK: - Conversations

    func fetchConversations() async throws -> [ChatHistoryItem] {
        let endpoint = Endpoint(path: "/api/conversations", requiresAuth: true)
        return try await api.send(endpoint, as: [ChatHistoryItem].self)
    }

    func deleteConversation(_ id: String) async throws {
        let endpoint = Endpoint(
            path: "/api/conversations",
            method: .delete,
            query: [URLQueryItem(name: "id", value: id)],
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }

    // MARK: - Price Watches

    func fetchPriceWatches() async throws -> PriceWatchResponse {
        let endpoint = Endpoint(path: "/api/price-watch", requiresAuth: true)
        return try await api.send(endpoint, as: PriceWatchResponse.self)
    }

    func deletePriceWatch(_ id: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["id": id])
        let endpoint = Endpoint(path: "/api/price-watch", method: .delete, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    // MARK: - Preferences

    func fetchPreferences() async throws -> PreferencesResponse {
        let endpoint = Endpoint(path: "/api/preferences", requiresAuth: true)
        return try await api.send(endpoint, as: PreferencesResponse.self)
    }

    func saveStructuredPreferences(budgetLevel: String?, cuisineLikes: [String], dietaryRestrictions: String?) async throws {
        var payload: [String: Any] = [:]
        payload["budget_level"] = budgetLevel as Any
        payload["cuisine_likes"] = cuisineLikes
        payload["dietary_restrictions"] = dietaryRestrictions as Any
        let body = try JSONSerialization.data(withJSONObject: payload)
        let endpoint = Endpoint(path: "/api/preferences", method: .put, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    func savePreferencesList(_ prefs: [String]) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["preferences": prefs])
        let endpoint = Endpoint(path: "/api/preferences", method: .post, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    // MARK: - Bookings

    func fetchBookings() async throws -> [ProfileBooking] {
        let endpoint = Endpoint(path: "/api/bookings", method: .get, requiresAuth: true)
        let resp = try await api.send(endpoint, as: ProfileBookingsResponse.self)
        return resp.bookings
    }

    func hasReviewed(placeId: String, userId: String) async throws -> Bool {
        let endpoint = Endpoint(
            path: "/api/reviews",
            query: [URLQueryItem(name: "placeId", value: placeId)]
        )
        let resp = try await api.send(endpoint, as: PlaceReviewsResponse.self)
        return resp.reviews.contains { $0.userId == userId }
    }

    // MARK: - Integrations

    func fetchIntegrations() async throws -> IntegrationsResponse {
        let endpoint = Endpoint(path: "/api/integrations", requiresAuth: true)
        return try await api.send(endpoint, as: IntegrationsResponse.self)
    }
}

private struct AvatarUploadResponse: Codable {
    var avatarUrl: String?
    enum CodingKeys: String, CodingKey {
        case avatarUrl = "avatar_url"
    }
}
