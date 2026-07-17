import Foundation

/// Presentation state for the login flow. Holds transient UI state only; all auth work is delegated
/// to `AuthRepository` (which talks to the backend). No product rules here.
@MainActor
final class AuthViewModel: AppObservableObject {
    enum Mode: Equatable { case methods, otpCode }
    enum ProviderState: Equatable { case loading, loaded, failed }

    @AppPublished var email = ""
    @AppPublished var code = ""
    @AppPublished var mode: Mode = .methods
    @AppPublished var isWorking = false
    @AppPublished var errorMessage: String?
    @AppPublished var showRegister = false
    @AppPublished var providerState: ProviderState = .loading
    @AppPublished var enabledProviders: [String] = []

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
            providerState = .loaded
        } catch {
            AppLogger.network.info("provider config load failed")
            providerState = .failed
        }
    }

    var emailValid: Bool { AuthValidation.isValidEmail(email) }
    var codeValid: Bool { AuthValidation.isValidOTP(code) }

    func sendOTP() async {
        guard emailValid else { errorMessage = "Email không hợp lệ"; return }
        await run { try await self.repo.sendEmailOTP(email: self.email); self.mode = .otpCode }
    }

    func verifyOTP() async {
        guard codeValid else { errorMessage = "Mã gồm 6 chữ số"; return }
        await run { try await self.repo.verifyEmailOTP(email: self.email, code: self.code); self.onAuthenticated() }
    }

    func continueWithGoogle() async {
        await run { try await self.repo.signInWithGoogle(); self.onAuthenticated() }
    }

    func continueWithZalo() async {
        await run { try await self.repo.signInWithZalo(); self.onAuthenticated() }
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
