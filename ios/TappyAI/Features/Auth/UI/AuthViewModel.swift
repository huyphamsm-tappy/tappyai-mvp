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
    /// App Review 1.2: the agreement to the Terms, required before ANY sign-in path (see `AuthTermsGate`).
    @AppPublished var termsAgreed: Bool
    /// A sign-in was refused for want of the agreement. The line is shown BESIDE the checkbox (the bottom of this
    /// scrolling screen is off the visible viewport), and goes away as soon as the box is ticked.
    @AppPublished var termsRequiredShown = false
    var termsRefusalVisible: Bool { termsRequiredShown && !termsAgreed }
    @AppPublished var providerState: ProviderState = .loading
    @AppPublished var enabledProviders: [String] = []
    /// Sign in with Apple is shown only when the server enables it (`AppleSignIn.isEnabled`).
    @AppPublished var appleEnabled = false
    /// The raw nonce of the Apple request in flight; Apple got its SHA-256.
    private var appleNonce: String?

    private let repo: AuthRepository
    private let config: AppConfigService
    private let onAuthenticated: () -> Void
    private let consent: TermsConsent

    init(repo: AuthRepository, config: AppConfigService, consent: TermsConsent = TermsConsent(),
         onAuthenticated: @escaping () -> Void) {
        self.repo = repo
        self.config = config
        self.consent = consent
        self.termsAgreed = AuthTermsGate.initiallyAgreed(consent: consent)
        self.onAuthenticated = onAuthenticated
    }

    /// Every method below asks this first. A refusal says why next to the Terms checkbox and does nothing else.
    private func termsAllowSignIn() -> Bool {
        if AuthTermsGate.allow(agreed: termsAgreed, consent: consent) {
            termsRequiredShown = false
            return true
        }
        errorMessage = nil          // one message, beside the checkbox: not a second one at the bottom
        termsRequiredShown = true
        return false
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
        guard termsAllowSignIn() else { return }
        guard passwordSignInValid else { errorMessage = NSLocalizedString("auth.error.invalidCredentials", comment: ""); return }
        await run { try await self.repo.signIn(email: self.email, password: self.password); self.onAuthenticated() }
    }

    func sendOTP() async {
        guard termsAllowSignIn() else { return }
        guard emailValid else { errorMessage = NSLocalizedString("auth.error.invalidEmail", comment: ""); return }
        await run { try await self.repo.sendEmailOTP(email: self.email); self.mode = .otpCode }
    }

    func verifyOTP() async {
        guard termsAllowSignIn() else { return }
        guard codeValid else { errorMessage = NSLocalizedString("auth.error.otpLength", comment: ""); return }
        await run { try await self.repo.verifyEmailOTP(email: self.email, code: self.code); self.onAuthenticated() }
    }

    func continueWithGoogle() async {
        guard termsAllowSignIn() else { return }
        await run { try await self.repo.signInWithGoogle(); self.onAuthenticated() }
    }

    /// Zalo needs the server to hand the app a state-bound callback (MOB-1). Until the server that answers
    /// supports it, the flow ends on a web page or a refused callback: say so in one plain line, never leave
    /// the screen stuck, and leave Google / email untouched.
    func continueWithZalo() async {
        guard termsAllowSignIn() else { return }
        isWorking = true; errorMessage = nil
        defer { isWorking = false }
        do {
            try await repo.signInWithZalo()
            onAuthenticated()
        } catch let e as AppError where e == .cancellation {
            return
        } catch let e as AuthCallbackError {
            errorMessage = e.errorDescription   // a refused callback (wrong/missing state) keeps its own, specific wording
        } catch {
            errorMessage = NSLocalizedString("auth.zalo.unavailable", comment: "")
        }
    }

    /// Starts an Apple request: a fresh nonce, whose SHA-256 goes into the request.
    func prepareAppleRequest() -> String {
        let nonce = AppleSignIn.randomNonce()
        appleNonce = nonce
        return AppleSignIn.sha256(nonce)
    }

    /// The Apple sheet finished. Cancelling it is silent, like the other providers.
    /// `userId` is Apple's stable id for this person and app; `fullName` is present only the first time.
    func finishApple(identityToken: Data?, userId: String? = nil, fullName: PersonNameComponents? = nil, error: Error?) async {
        let nonce = appleNonce
        appleNonce = nil
        if let error {
            if (error as NSError).domain == "com.apple.AuthenticationServices.AuthorizationError",
               (error as NSError).code == 1001 { return }   // ASAuthorizationError.canceled
            errorMessage = ErrorPresenter.present(.unexpected(message: error.localizedDescription)).message
            return
        }
        // The button is disabled until the box is ticked; this refuses a credential that arrives without it.
        guard termsAllowSignIn() else { return }
        guard let identityToken, let token = String(data: identityToken, encoding: .utf8), let nonce else {
            errorMessage = ErrorPresenter.present(.unexpected(message: "apple identity token missing")).message
            return
        }
        let name = AppleSignIn.displayName(fullName)
        await run {
            try await self.repo.signInWithApple(idToken: token, nonce: nonce, appleUserId: userId, fullName: name)
            self.onAuthenticated()
        }
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
        catch let e as AuthCallbackError { errorMessage = e.errorDescription }
        catch { errorMessage = ErrorPresenter.present(.unexpected(message: error.localizedDescription)).message }
    }
}
