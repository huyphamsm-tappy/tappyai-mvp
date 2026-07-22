import AuthenticationServices
import UIKit

/// Thin wrapper over `ASWebAuthenticationSession` (HIG-blessed, shared cookie jar). Used for Google
/// OAuth and the single-session Zalo flow (survey §5). Returns the final callback URL matching the
/// app scheme; the caller exchanges it for a session via `AuthService`.
@MainActor
final class WebAuthenticator: NSObject, ASWebAuthenticationPresentationContextProviding {

    /// Opens `url` and completes when the browser redirects to `callbackScheme://…`.
    /// - `prefersEphemeral`: pass `true` to isolate the cookie jar (not used for Zalo, which needs
    ///   its transient `zalo_*` cookies to persist across hops within this one session).
    func authenticate(url: URL, callbackScheme: String, prefersEphemeral: Bool = false) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callbackURL, error in
                if let error {
                    if let asError = error as? ASWebAuthenticationSessionError, asError.code == .canceledLogin {
                        continuation.resume(throwing: AppError.cancellation)
                    } else {
                        continuation.resume(throwing: AppError.authentication(reason: .unauthenticated))
                    }
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: AppError.authentication(reason: .unauthenticated))
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = prefersEphemeral
            if !session.start() {
                continuation.resume(throwing: AppError.authentication(reason: .unauthenticated))
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        return window ?? ASPresentationAnchor()
    }
}
