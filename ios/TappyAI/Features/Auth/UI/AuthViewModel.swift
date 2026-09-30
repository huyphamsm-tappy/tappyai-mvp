import Foundation

/// Presentation state for the login flow. Holds transient UI state only; all auth work is delegated
/// to `AuthRepository` (which talks to the backend). No product rules here.
@MainActor
final class AuthViewModel: AppObservableObject {
    enum Mode: Equatable { case methods, otpCode }
    enum ProviderState: Equatable { case loading, loaded, failed }

    @AppPublished var email = ""
    @AppPublished var code = ""
    @AppPublished var password = ""
    /// The email step offers a one-time code instead of a password.
    @AppPublished var useCode = false
    @AppPublished var mode: Mode = .methods
    @AppPublished var isWorking = false
    @AppPublished var errorMessage: String?
    @AppPublished var showRegister = false
    @AppPublished var providerState: ProviderState = .loading
    @AppPublished var enabledProviders: [String] = []
    /// Sign in with Apple is shown only when the server enables it (`AppleSignIn.isEnabled`).
    @AppPublished var appleEnabled = false
    /// The raw nonce of the Apple request in flight; Apple got its SHA-256.
    private var appleNonce: String?

    private let repo: AuthRepository
    private let config: AppConfigService
    private let onAuthenticated: () -> Void

    init(repo: AuthRepository, config: AppConfigService, onAuthenticated: @escaping () -> Void) {
        self.repo = repo
        self.config = config
        self.onAuthenticated = onAuthenticated
    }

    func loadProviders() async {
        providerState = .loading
        do {
            enabledProviders = try await config.enabledProviders()
            let appleFlag = (try? await config.config())?.flags.appleSignIn
            appleEnabled = AppleSignIn.isEnabled(flag: appleFlag, providers: enabledProviders)
            providerState = .loaded
        } catch {
            AppLogger.network.info("provider config load failed")
            providerState = .failed
        }
    }

    var emailValid: Bool { AuthValidation.isValidEmail(email) }
    var passwordSignInValid: Bool { emailValid && AuthValidation.isValidPassword(password) }
    var codeValid: Bool { AuthValidation.isValidOTP(code) }

    func signInWithPassword() async {
        guard passwordSignInValid else { errorMessage = NSLocalizedString("auth.error.invalidCredentials", comment: ""); return }
        await run { try await self.repo.signIn(email: self.email, password: self.password); self.onAuthenticated() }
    }

    func sendOTP() async {
        guard emailValid else { errorMessage = NSLocalizedString("auth.error.invalidEmail", comment: ""); return }
        await run { try await self.repo.sendEmailOTP(email: self.email); self.mode = .otpCode }
    }

    func verifyOTP() async {
        guard codeValid else { errorMessage = NSLocalizedString("auth.error.otpLength", comment: ""); return }
        await run { try await self.repo.verifyEmailOTP(email: self.email, code: self.code); self.onAuthenticated() }
    }

    func continueWithGoogle() async {
        await run { try await self.repo.signInWithGoogle(); self.onAuthenticated() }
    }

    func continueWithZalo() async {
        await run { try await self.repo.signInWithZalo(); self.onAuthenticated() }
    }

    /// Starts an Apple request: a fresh nonce, whose SHA-256 goes into the request.
    func prepareAppleRequest() -> String {
        let nonce = AppleSignIn.randomNonce()
        appleNonce = nonce
        return AppleSignIn.sha256(nonce)
    }

    /// The Apple sheet finished. Cancelling it is silent, like the other providers.
    func finishApple(identityToken: Data?, error: Error?) async {
        let nonce = appleNonce
        appleNonce = nil
        if let error {
            if (error as NSError).domain == "com.apple.AuthenticationServices.AuthorizationError",
               (error as NSError).code == 1001 { return }   // ASAuthorizationError.canceled
            errorMessage = ErrorPresenter.present(.unexpected(message: error.localizedDescription)).message
            return
        }
        guard let identityToken, let token = String(data: identityToken, encoding: .utf8), let nonce else {
            errorMessage = ErrorPresenter.present(.unexpected(message: "apple identity token missing")).message
            return
        }
        await run { try await self.repo.signInWithApple(idToken: token, nonce: nonce); self.onAuthenticated() }
    }

    func backToMethods() { mode = .methods; code = ""; errorMessage = nil }

    /// Runs an async auth op with unified loading + error handling. Cancellation is silent.
    private func run(_ op: @escaping () async throws -> Void) async {
        isWorking = true; errorMessage = nil
        defer { isWorking = false }
        do { try await op() }
        catch let e as AppError {
            if e == .cancellation { return }
            errorMessage = ErrorPresenter.present(e).message
        }
        catch { errorMessage = ErrorPresenter.present(.unexpected(message: error.localizedDescription)).message }
    }
}
