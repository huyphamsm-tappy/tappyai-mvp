import Foundation

/// Drives the Zalo login **entirely inside one `ASWebAuthenticationSession`** (survey §0 · D2), so
/// the backend's transient `zalo_login_*` / `zalo_at` httpOnly cookies persist across all 5 hops
/// exactly as on Web. **No new backend endpoints** — it opens the existing `/api/auth/zalo` and lets
/// the server run callback → complete → `/auth/confirm`, then captures the final app-scheme redirect.
///
/// BACKEND DEPENDENCY (integration point, documented in the report): the final server redirect
/// (today a web page `/auth/confirm`) must land on `tappyai://auth/callback` carrying a PKCE `code`
/// (preferred) or `token_hash`, so the native app can finalize the Supabase session. This is a
/// redirect-target change on existing routes, not a new endpoint.
@MainActor
struct ZaloAuthController {
    let apiBaseURL: URL
    let webAuth: WebAuthenticator
    let callbackScheme: String   // "tappyai"

    /// Returns the callback URL captured at the end of the flow (for `AuthService.session(fromCallback:)`).
    func authenticate(returnTo: String = "/") async throws -> URL {
        var components = URLComponents(url: apiBaseURL.appendingPathComponent("/api/auth/zalo"),
                                       resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "returnTo", value: returnTo),
            URLQueryItem(name: "platform", value: "ios")   // hint; server keeps existing behavior
        ]
        guard let startURL = components?.url else {
            throw AppError.unexpected(message: "Invalid Zalo start URL")
        }
        // Not ephemeral: the zalo_* cookies must persist across hops within this session.
        return try await webAuth.authenticate(url: startURL, callbackScheme: callbackScheme, prefersEphemeral: false)
    }
}
