import SwiftUI

@MainActor
final class RegisterViewModel: AppObservableObject {
    @AppPublished var fullName = ""
    @AppPublished var email = ""
    @AppPublished var password = ""
    @AppPublished var isWorking = false
    @AppPublished var errorMessage: String?
    @AppPublished var needsEmailConfirmation = false
    /// App Review 1.2: no account is created before the Terms are agreed (see `AuthTermsGate`).
    @AppPublished var termsAgreed: Bool

    private let repo: AuthRepository
    private let onRegistered: () -> Void
    private let consent: TermsConsent

    init(repo: AuthRepository, consent: TermsConsent = TermsConsent(), onRegistered: @escaping () -> Void) {
        self.repo = repo; self.onRegistered = onRegistered; self.consent = consent
        self.termsAgreed = AuthTermsGate.initiallyAgreed(consent: consent)
    }

    /// Mirrors Web validation (survey §1.6): name required, email, password ≥ 6.
    var valid: Bool {
        AuthValidation.isNonEmptyName(fullName) && AuthValidation.isValidEmail(email) && AuthValidation.isValidPassword(password)
    }

    func submit() async {
        guard valid else { errorMessage = NSLocalizedString("register.error.invalid", comment: ""); return }
        guard AuthTermsGate.allow(agreed: termsAgreed, consent: consent) else {
            errorMessage = NSLocalizedString("auth.terms.required", comment: ""); return
        }
        isWorking = true; errorMessage = nil
        defer { isWorking = false }
        do {
            let hasSession = try await repo.register(email: email, password: password, fullName: fullName)
            if hasSession { onRegistered() } else { needsEmailConfirmation = true }
        } catch let e as AppError {
            errorMessage = ErrorPresenter.present(e).message
        } catch {
            errorMessage = ErrorPresenter.present(.unexpected(message: error.localizedDescription)).message
        }
    }
}

struct RegisterView: View {
    @AppStateObject private var vm: RegisterViewModel

    init(repo: AuthRepository, onRegistered: @escaping () -> Void) {
        _vm = AppStateObject(wrappedValue: RegisterViewModel(repo: repo, onRegistered: onRegistered))
    }

    var body: some View {
        Group {
            if vm.needsEmailConfirmation {
                TappyEmptyState(systemImage: "envelope.badge",
                                title: "register.checkEmail.title",
                                message: "register.checkEmail.body")
            } else {
                form
            }
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("register.title", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                TappyTextField(titleKey: "account.fullName", text: $vm.fullName)
                TappyTextField(titleKey: "Email", text: $vm.email)
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                TappyTextField(titleKey: "auth.password", text: $vm.password, isSecure: true)
                AuthTermsConsentView(agreed: $vm.termsAgreed)
                Button(NSLocalizedString("auth.signUp", comment: "")) { Task { await vm.submit() } }
                    .buttonStyle(.tappy(.primary))
                    .disabled(!vm.valid || !vm.termsAgreed)
                if let error = vm.errorMessage {
                    Text(error).font(TappyFont.footnote).foregroundStyle(TappyColor.danger)
                }
            }
            .padding(Spacing.md)
        }
        .overlay { if vm.isWorking { TappyLoadingIndicator() } }
    }
}
