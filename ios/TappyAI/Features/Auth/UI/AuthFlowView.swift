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
                        presentation: .init(title: "Không tải được cấu hình",
                                            message: "Kiểm tra kết nối mạng rồi thử lại.",
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
                .padding(Spacing.md).tappyTappable("Đóng")
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
                    Button("Tiếp tục với Google") { Task { await vm.continueWithGoogle() } }
                        .buttonStyle(.tappy(.primary))
                }
                if vm.enabledProviders.contains("zalo") {
                    Button("Đăng nhập bằng Zalo") { Task { await vm.continueWithZalo() } }
                        .buttonStyle(.tappy(.secondary))
                }
                if vm.enabledProviders.contains("email") {
                    dividerOr
                    if vm.mode == .methods { emailStep } else { codeStep }
                }
                Button("Tạo tài khoản mới") { vm.showRegister = true }
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
            Text("Đăng nhập").font(TappyFont.largeTitle).foregroundStyle(TappyColor.textPrimary)
            Text("Đăng nhập để lưu lịch sử và cá nhân hoá.")
                .font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
        }
        .padding(.bottom, Spacing.sm)
    }

    private var dividerOr: some View {
        HStack {
            Rectangle().fill(TappyColor.separator).frame(height: 1)
            Text("hoặc").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
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
            Button("Gửi mã đăng nhập") { Task { await vm.sendOTP() } }
                .buttonStyle(.tappy(.primary))
                .disabled(!vm.emailValid)
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Nhập mã 6 số đã gửi tới \(vm.email)")
                .font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
            TappyTextField(titleKey: "Mã xác minh", text: $vm.code)
                .keyboardType(.numberPad)
            HStack(spacing: Spacing.sm) {
                Button("Đổi email") { vm.backToMethods() }.buttonStyle(.tappy(.tertiary))
                Button("Xác minh") { Task { await vm.verifyOTP() } }
                    .buttonStyle(.tappy(.primary))
                    .disabled(!vm.codeValid)
            }
        }
    }
}
