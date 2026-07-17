import Foundation
import Supabase

/// Maps a Supabase `Session` into the foundation's `AuthTokens` (the app's single token model).
extension AuthTokens {
    init(session: Session) {
        self.init(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresAt: Date(timeIntervalSince1970: session.expiresAt)
        )
    }
}

/// Response of the STABLE anonymous-session contract `POST /api/auth/anonymous`
/// (docs/ios/PHASE1_AUTH_SURVEY §0 · D1). The client depends on this shape only — never on how the
/// backend mints these tokens (Supabase anon / custom JWT / internal identity service / …).
struct AnonymousSessionResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let anonymousId: String
    let expiresAt: Double?   // epoch seconds; optional

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case anonymousId = "anonymous_id"
        case expiresAt = "expires_at"
    }

    var tokens: AuthTokens {
        AuthTokens(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt.map { Date(timeIntervalSince1970: $0) } ?? Date().addingTimeInterval(3600)
        )
    }
}

/// Onboarding payload (interests + city) for `POST /api/onboarding` (survey §1.7 / §1.9).
struct OnboardingPayload: Encodable {
    let interests: [String]
    let city: String
}
