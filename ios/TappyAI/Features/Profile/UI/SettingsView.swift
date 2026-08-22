import SwiftUI
import UIKit

/// The one public support address. Mirrors `SUPPORT_EMAIL` in `src/components/landing/config.ts`
/// and `SUPPORT_EMAIL` in Android's SettingsScreen; held to all three by
/// `src/lib/legal/accountDeletionParity.test.ts`, because a deletion request sent to an address
/// nobody reads is worse than no button at all.
private let SUPPORT_EMAIL = "support@tappyai.com"

struct ProfileSettingsView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var session: SessionStore

    @State private var showSignOutConfirm = false
    @State private var confirmDeleteAccount = false
    @State private var noMailAppMessage: String?

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
        .navigationTitle(Text("settings.title"))
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(Text("settings.signOut"), isPresented: $showSignOutConfirm, titleVisibility: .visible) {
            Button(role: .destructive) {
                Task { await deps.authRepository.signOut() }
            } label: { Text("settings.signOut") }
            Button(role: .cancel) {} label: { Text("common.cancel") }
        }
        .alert(Text("settings.deleteAccount.confirmTitle"), isPresented: $confirmDeleteAccount) {
            Button { openDeletionRequest() } label: { Text("settings.deleteAccount.continue") }
            Button(role: .cancel) {} label: { Text("common.cancel") }
        } message: {
            Text("settings.deleteAccount.confirmBody")
        }
        .alert(
            Text("settings.deleteAccount.noMailTitle"),
            isPresented: Binding(get: { noMailAppMessage != nil }, set: { if !$0 { noMailAppMessage = nil } })
        ) {
            Button { noMailAppMessage = nil } label: { Text("common.ok") }
        } message: {
            Text(noMailAppMessage ?? "")
        }
    }

    /// Opens the mail composer with the deletion request already written.
    ///
    /// 🚨 The app never deletes anything itself, and that is the published contract rather than a
    /// shortcut: /delete-account tells people support verifies ownership before erasing data, so a
    /// client-side delete would be a different promise from the one the store listing points
    /// reviewers at.
    ///
    /// `mailto:` resolves to mail clients only. Not every device has one configured — the same
    /// case Android handles with a toast — so the failure says what to do instead of doing nothing.
    private func openDeletionRequest() {
        confirmDeleteAccount = false
        let subject = NSLocalizedString("settings.deleteAccount.emailSubject", comment: "")
        let body = NSLocalizedString("settings.deleteAccount.emailBody", comment: "")
        let allowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+"))
        let encodedSubject = subject.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        let encodedBody = body.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        guard let url = URL(string: "mailto:\(SUPPORT_EMAIL)?subject=\(encodedSubject)&body=\(encodedBody)"),
              UIApplication.shared.canOpenURL(url) else {
            noMailAppMessage = String(
                format: NSLocalizedString("settings.deleteAccount.noMailBody", comment: ""),
                SUPPORT_EMAIL
            )
            return
        }
        UIApplication.shared.open(url)
    }

    // MARK: - Options

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("settings.section.options")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                settingsRow(icon: "bell", labelKey: "settings.notifications", desc: nil) {
                    router.push(ProfileDestination.notifications, on: .profile)
                }
                Divider().padding(.leading, 52)
                settingsRow(icon: "brain", labelKey: "settings.memory", desc: nil) {
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

            Text("settings.language")
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
            Text("settings.section.other")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                // Usage guidance sits with the reference documents rather than in onboarding:
                // onboarding runs once and cannot answer "how does this work?" afterwards.
                // Uses the LocalizedStringKey overload below so the label follows the in-app
                // language picker; the rows beneath it are hardcoded Vietnamese, a pre-existing
                // gap deliberately left alone here.
                settingsRow(icon: "book", labelKey: "guide.settingsRow", desc: nil) {
                    router.push(ProfileDestination.howToUse, on: .profile)
                }
                Divider().padding(.leading, 52)
                settingsRow(icon: "doc.text", labelKey: "settings.terms", desc: nil) {
                    router.push(ProfileDestination.terms, on: .profile)
                }
                Divider().padding(.leading, 52)
                settingsRow(icon: "shield", labelKey: "settings.privacyPolicy", desc: nil) {
                    router.push(ProfileDestination.privacy, on: .profile)
                }
                Divider().padding(.leading, 52)
                // The music copyright / notice-and-takedown policy. Sits with the other two
                // because it is the third document a user is bound by, and because a rights
                // holder looking for where to send a complaint looks under legal, not under music.
                settingsRow(icon: "music.note.list", labelKey: "settings.copyright", desc: nil) {
                    router.push(ReviewsDestination.copyrightPolicy, on: .profile)
                }
                Divider().padding(.leading, 52)
                // ── Account deletion ──────────────────────────────────────────────────────────
                //
                // 🚨 REQUIRED BY APP STORE REVIEW GUIDELINE 5.1.1(v): an app that lets people
                // create an account must let them initiate deleting it from inside the app. iOS
                // had no such affordance at all, which is a rejection on submission rather than a
                // parity nicety — Android has carried this row for exactly the same reason on the
                // Play side.
                //
                // Request-based on purpose, identical to Android and to what the public
                // /delete-account page documents: support verifies the requester owns the account
                // before anything is erased, and the app deletes nothing itself. The label is
                // fixed word-for-word by step 3 of that page, which is why it is asserted rather
                // than written freely.
                settingsRow(icon: "trash", labelKey: "settings.deleteAccount", desc: nil) {
                    confirmDeleteAccount = true
                }
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )

            Text(String(
                format: NSLocalizedString("settings.version", comment: ""),
                Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
            ))
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
                Text("settings.signOut")
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

    /// Localized variant of `settingsRow`. Additive on purpose: the existing rows pass plain
    /// `String` literals and are left untouched, while a row whose label must follow the in-app
    /// language picker passes a `LocalizedStringKey`, which SwiftUI resolves through
    /// `.environment(\.locale, …)`. `String(localized:)` would not — it reads the bundle locale
    /// once and would ignore the picker entirely.
    @ViewBuilder
    private func settingsRow(icon: String, labelKey: LocalizedStringKey, desc: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Spacing.md) {
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(width: 32, height: 32)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                VStack(alignment: .leading, spacing: 2) {
                    Text(labelKey)
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
