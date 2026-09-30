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

    /// Stores the signed-in user's date of birth (`PATCH /api/profile {"dateOfBirth":"YYYY-MM-DD"}`,
    /// `src/app/api/profile/route.ts`). The route is deliberately outside the age gate, so an
    /// account refused by `/api/chat` can still reach it. 400 → `.validation(serverMessage)`;
    /// 409 `age_correction_exhausted` once the one self-correction is used.
    func updateDateOfBirth(_ iso: String) async throws -> DateOfBirthUpdateResponse {
        let body = try JSONSerialization.data(withJSONObject: ["dateOfBirth": iso])
        let endpoint = Endpoint(path: "/api/profile", method: .patch, body: body, requiresAuth: true)
        return try await api.send(endpoint, as: DateOfBirthUpdateResponse.self)
    }

    /// The account's age status (`GET /api/profile` → `ageStatus`, `canCorrectAge`); the raw date of
    /// birth is never returned.
    func fetchAgeStatus() async throws -> DateOfBirthUpdateResponse {
        let endpoint = Endpoint(path: "/api/profile", requiresAuth: true)
        return try await api.send(endpoint, as: DateOfBirthUpdateResponse.self)
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

    /// `POST /api/profile` with a `cover` multipart part (≤5 MB, bytes sniffed server-side) → the new
    /// public `cover_url`. The web's "Thay ảnh bìa".
    func uploadCover(_ data: Data, boundary: String) async throws -> String? {
        let endpoint = Endpoint(
            path: "/api/profile",
            method: .post,
            body: data,
            requiresAuth: true,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        let resp = try await api.send(endpoint, as: CoverUploadResponse.self)
        return resp.coverUrl
    }

    /// `PATCH /api/profile {"cover_url": null}` — the web's "Gỡ ảnh bìa" (a cover can only be cleared by PATCH).
    func clearCover() async throws {
        let body = "{\"cover_url\":null}".data(using: .utf8)
        let endpoint = Endpoint(path: "/api/profile", method: .patch, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
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

private struct CoverUploadResponse: Codable {
    var coverUrl: String?
    enum CodingKeys: String, CodingKey {
        case coverUrl = "cover_url"
    }
}

private struct AvatarUploadResponse: Codable {
    var avatarUrl: String?
    enum CodingKeys: String, CodingKey {
        case avatarUrl = "avatar_url"
    }
}
