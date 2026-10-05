import AuthenticationServices
import UIKit

/// Asks the person to confirm with Apple again and returns the fresh, SINGLE-USE `authorizationCode`.
///
/// Used only by account deletion (App Review 5.1.1(v)): the server exchanges the code with Apple and revokes the person's Apple
/// authorisation before it deletes the account (`AccountDeletionFlow`). It requests no name or email scope. The code is handed to the
/// caller and nowhere else: never stored, never logged, never shown.
///
/// Returns nil when the person cancels the Apple sheet; any other failure throws.
@MainActor
final class AppleReauthorizer: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<String?, Error>?
    /// Held while the sheet is up: the controller is released by ARC as soon as nothing references it.
    private var controller: ASAuthorizationController?

    func authorizationCode() async throws -> String? {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = []
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential
        let code = credential?.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        finish(.success(code))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        // Same check as the sign-in sheet (`AuthViewModel.finishApple`): ASAuthorizationError.canceled == 1001.
        if (error as NSError).domain == "com.apple.AuthenticationServices.AuthorizationError", (error as NSError).code == 1001 {
            finish(.success(nil))
        } else {
            finish(.failure(error))
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        return window ?? ASPresentationAnchor()
    }

    private func finish(_ result: Result<String?, Error>) {
        controller = nil
        let pending = continuation
        continuation = nil
        pending?.resume(with: result)
    }
}
