import SwiftUI

struct ProfileSettingsView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var session: SessionStore

    @State private var showSignOutConfirm = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                optionsSection
                otherSection
                signOutSection
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Cài đặt")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Đăng xuất", isPresented: $showSignOutConfirm, titleVisibility: .visible) {
            Button("Đăng xuất", role: .destructive) {
                Task { await deps.authRepository.signOut() }
            }
            Button("Huỷ", role: .cancel) {}
        }
    }

    // MARK: - Options

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("TÙY CHỌN")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                settingsRow(icon: "bell", label: "Thông báo", desc: "Push notification") {
                    router.push(ProfileDestination.notifications, on: .profile)
                }
                Divider().padding(.leading, 52)
                settingsRow(icon: "brain", label: "Bộ nhớ Tappy", desc: "Quản lý trí nhớ AI") {
                    router.push(ProfileDestination.tappyKnows, on: .profile)
                }
                Divider().padding(.leading, 52)
                languageSwitcher
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Language Switcher

    private var languageSwitcher: some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: "globe")
                .font(.system(size: 15))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(width: 32, height: 32)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

            Text("Ngôn ngữ")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(TappyColor.textPrimary)

            Spacer()

            HStack(spacing: 6) {
                langPill(code: "vi", flag: "🇻🇳")
                langPill(code: "en", flag: "🇬🇧")
            }
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
    }

    @ViewBuilder
    private func langPill(code: String, flag: String) -> some View {
        let isActive = deps.localization.language.rawValue == code
        Button {
            if let lang = AppLanguage(rawValue: code) {
                deps.localization.setLanguage(lang)
            }
            Task { try? await ProfileService(api: deps.api).updateLanguage(code) }
        } label: {
            Text("\(flag) \(code.uppercased())")
                .font(.system(size: 11, weight: .medium))
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 5)
                .background(isActive ? TappyColor.primary : TappyColor.surface)
                .foregroundStyle(isActive ? .white : TappyColor.textSecondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Other

    private var otherSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("KHÁC")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                settingsRow(icon: "doc.text", label: "Điều khoản sử dụng", desc: nil) {
                    router.push(ProfileDestination.terms, on: .profile)
                }
                Divider().padding(.leading, 52)
                settingsRow(icon: "shield", label: "Chính sách bảo mật", desc: nil) {
                    router.push(ProfileDestination.privacy, on: .profile)
                }
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )

            Text("Phiên bản \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")")
                .font(.system(size: 11))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.top, Spacing.xs)
        }
    }

    // MARK: - Sign Out

    private var signOutSection: some View {
        Button { showSignOutConfirm = true } label: {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 15))
                Text("Đăng xuất")
                    .font(.system(size: 14, weight: .medium))
            }
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.md)
        }
        .buttonStyle(.plain)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Row

    @ViewBuilder
    private func settingsRow(icon: String, label: String, desc: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Spacing.md) {
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(width: 32, height: 32)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(TappyColor.textPrimary)
                    if let desc {
                        Text(desc)
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
        }
        .buttonStyle(.plain)
    }
}
