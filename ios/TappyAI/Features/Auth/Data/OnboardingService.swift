import Foundation

/// Persists onboarding via the backend endpoint `POST /api/onboarding` (Bearer). The server upserts
/// `profiles.onboarded=true` and seeds memory (survey §1.9) — the client sends inputs only.
struct OnboardingService: Sendable {
    let api: APIClient

    func submit(interests: [String], city: String) async throws {
        let body = try JSONEncoder().encode(OnboardingPayload(interests: interests, city: city))
        let endpoint = Endpoint(
            path: "/api/onboarding",
            method: .post,
            body: body,
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }
}
