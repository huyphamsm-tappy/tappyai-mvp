import SwiftUI

@MainActor
final class RegisterViewModel: AppObservableObject {
    @AppPublished var fullName = ""
    @AppPublished var email = ""
    @AppPublished var password = ""
    @AppPublished var isWorking = false
    @AppPublished var errorMessage: String?
    @AppPublished var needsEmailConfirmation = false

    private let repo: AuthRepository
    private let onRegistered: () -> Void

    init(repo: AuthRepository, onRegistered: @escaping () -> Void) {
        self.repo = repo; self.onRegistered = onRegistered
    }

    /// Mirrors Web validation (survey §1.6): name required, email, password ≥ 6.
    var valid: Bool {
        AuthValidation.isNonEmptyName(fullName) && AuthValidation.isValidEmail(email) && AuthValidation.isValidPassword(password)
    }

    func submit() async {
        guard valid else { errorMessage = "Vui lòng nhập tên, email và mật khẩu ≥ 6 ký tự"; return }
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
                                title: "Kiểm tra email của bạn",
                                message: "Chúng tôi đã gửi liên kết xác nhận tới email của bạn.")
            } else {
                form
            }
        }
        .background(TappyColor.background)
        .navigationTitle("Tạo tài khoản")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                TappyTextField(titleKey: "Họ và tên", text: $vm.fullName)
                TappyTextField(titleKey: "Email", text: $vm.email)
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                TappyTextField(titleKey: "Mật khẩu", text: $vm.password, isSecure: true)
                Button("Đăng ký") { Task { await vm.submit() } }
                    .buttonStyle(.tappy(.primary))
                    .disabled(!vm.valid)
                if let error = vm.errorMessage {
                    Text(error).font(TappyFont.footnote).foregroundStyle(TappyColor.danger)
                }
            }
            .padding(Spacing.md)
        }
        .overlay { if vm.isWorking { TappyLoadingIndicator() } }
    }
}
