import SwiftUI

/// The login screen: Google, Zalo, and Email-OTP, plus a link to registration. Presented modally
/// from the temporary sign-in entry (Phase 1). Native HIG components; behavior mirrors Web `/login`.
struct AuthFlowView: View {
    @AppStateObject private var vm: AuthViewModel
    private let repo: AuthRepository
    private let onClose: () -> Void

    private let config: AppConfigService

    init(repo: AuthRepository, config: AppConfigService, onClose: @escaping () -> Void) {
        self.repo = repo
        self.config = config
        self.onClose = onClose
        _vm = AppStateObject(wrappedValue: AuthViewModel(repo: repo, config: config, onAuthenticated: onClose))
    }

    var body: some View {
        ZStack {
            TappyColor.background.ignoresSafeArea()
            Group {
                switch vm.providerState {
                case .loading:
                    VStack { Spacer(); TappyLoadingIndicator(); Spacer() }
                case .failed:
                    TappyErrorState(
                        presentation: .init(title: NSLocalizedString("auth.config.error.title", comment: ""),
                                            message: NSLocalizedString("auth.config.error.message", comment: ""),
                                            retryable: true),
                        onRetry: { Task { await vm.loadProviders() } }
                    )
                case .loaded:
                    loginContent
                }
            }
            if vm.isWorking {
                Color.black.opacity(0.1).ignoresSafeArea()
                TappyLoadingIndicator()
            }
        }
        .overlay(alignment: .topTrailing) {
            Button { onClose() } label: { Image(systemName: TappyIcon.close) }
                .padding(Spacing.md).tappyTappable(NSLocalizedString("common.close", comment: ""))
        }
        .task { await vm.loadProviders() }
        .sheet(isPresented: $vm.showRegister) {
            NavigationStack { RegisterView(repo: repo) { vm.showRegister = false; onClose() } }
        }
    }

    private var loginContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                header
                if vm.enabledProviders.contains("google") {
                    Button("auth.continueGoogle") { Task { await vm.continueWithGoogle() } }
                        .buttonStyle(.tappy(.primary))
                }
                if vm.enabledProviders.contains("zalo") {
                    Button("auth.continueZalo") { Task { await vm.continueWithZalo() } }
                        .buttonStyle(.tappy(.secondary))
                }
                if vm.enabledProviders.contains("email") {
                    dividerOr
                    if vm.mode == .methods { emailStep } else { codeStep }
                }
                Button("auth.createAccount") { vm.showRegister = true }
                    .buttonStyle(.tappy(.tertiary))
                if let error = vm.errorMessage {
                    Text(error).font(TappyFont.footnote).foregroundStyle(TappyColor.danger)
                }
            }
            .padding(Spacing.md)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text("auth.signIn").font(TappyFont.largeTitle).foregroundStyle(TappyColor.textPrimary)
            Text("auth.signIn.subtitle")
                .font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
        }
        .padding(.bottom, Spacing.sm)
    }

    private var dividerOr: some View {
        HStack {
            Rectangle().fill(TappyColor.separator).frame(height: 1)
            Text("auth.or").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            Rectangle().fill(TappyColor.separator).frame(height: 1)
        }
        .padding(.vertical, Spacing.xs)
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            TappyTextField(titleKey: "Email", text: $vm.email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("auth.sendCode") { Task { await vm.sendOTP() } }
                .buttonStyle(.tappy(.primary))
                .disabled(!vm.emailValid)
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(String(format: NSLocalizedString("auth.code.sentTo", comment: ""), vm.email))
                .font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
            TappyTextField(titleKey: "auth.code.label", text: $vm.code)
                .keyboardType(.numberPad)
            HStack(spacing: Spacing.sm) {
                Button("auth.changeEmail") { vm.backToMethods() }.buttonStyle(.tappy(.tertiary))
                Button("auth.verify") { Task { await vm.verifyOTP() } }
                    .buttonStyle(.tappy(.primary))
                    .disabled(!vm.codeValid)
            }
        }
    }
}
