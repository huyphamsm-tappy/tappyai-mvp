import SwiftUI
import UIKit

/// The one public support address. Mirrors `SUPPORT_EMAIL` in `src/components/landing/config.ts`
/// and `SUPPORT_EMAIL` in Android's SettingsScreen; held to all three by
/// `src/lib/legal/accountDeletionParity.test.ts`, because a deletion request sent to an address
/// nobody reads is worse than no button at all.
private let SUPPORT_EMAIL = "support@tappyai.com"

/// Settings — mirrors Android `SettingsScreen.kt` (owner L11, 30/09): a subtitle under the title, two
/// cards (Options: Notifications · Memory · Language · Appearance; Other: How to use · Terms · Privacy ·
/// Copyright · Delete account), the version, and Sign out — or, for a guest, a sign-in card (signing out
/// of a guest session would only mint a new anonymous identity and strand the conversation).
///
/// 🚫 MUSIC IS HIDDEN EVERYWHERE (copyright). There is no music row; the copyright row is the general
/// «Chính sách bản quyền» that opens the web `/copyright` page, as on Android.
///
/// Not mirrored: Android's «Âm thanh thông báo Tappy» toggle. It silences Android's own chime; on iOS a
/// push's sound is decided by the server's APNs payload, so a local switch could not keep its promise
/// («arrive quietly») for a background push. Needs a server flag first — see IOS-PROGRESS.
struct ProfileSettingsView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var session: SessionStore
    @ObservedObject private var theme: ThemeManager
    @ObservedObject private var localization: LocalizationManager
    @ObservedObject private var safety: SafetyStore

    @State private var showSignOutConfirm = false
    @State private var confirmDeleteAccount = false
    @State private var noMailAppMessage: String?
    /// Server flag `accountSelfDelete`; false until /api/config says otherwise.
    @State private var selfDeleteEnabled = false
    @State private var showSelfDelete = false
    @State private var showLanguagePicker = false
    @State private var showAppearancePicker = false
    @State private var showAuth = false

    init(deps: AppDependencies) {
        self.deps = deps
        _theme = ObservedObject(wrappedValue: deps.theme)
        _localization = ObservedObject(wrappedValue: deps.localization)
        _safety = ObservedObject(wrappedValue: deps.safety)
    }

    private var isSignedIn: Bool { session.state.isAuthenticated }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("settings.subtitle")
                    .font(.system(size: 14)).foregroundStyle(HomeV3.onSurfaceVariant)
                optionsSection
                otherSection
                Text(String(
                    format: NSLocalizedString("settings.version", comment: ""),
                    Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
                ))
                .font(.system(size: 12)).foregroundStyle(HomeV3.onSurfaceVariant)
                .frame(maxWidth: .infinity)
                if isSignedIn { signOutCard } else { signInCard }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .background(HomeV3.background.ignoresSafeArea())
        .navigationTitle(Text("settings.title"))
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(Text("settings.signOut"), isPresented: $showSignOutConfirm, titleVisibility: .visible) {
            Button(role: .destructive) {
                Task { await deps.authRepository.signOut() }
            } label: { Text("settings.signOut") }
            Button(role: .cancel) {} label: { Text("common.cancel") }
        }
        .confirmationDialog(Text("settings.language"), isPresented: $showLanguagePicker, titleVisibility: .visible) {
            ForEach(AppLanguage.allCases, id: \.rawValue) { lang in
                Button(Self.languageLabel(lang.rawValue)) { select(lang) }
            }
            Button(role: .cancel) {} label: { Text("common.cancel") }
        }
        .confirmationDialog(Text("settings.appearance"), isPresented: $showAppearancePicker, titleVisibility: .visible) {
            ForEach(ThemeMode.allCases) { mode in
                Button { theme.mode = mode } label: { Text(LocalizedStringKey("settings.appearance." + mode.rawValue)) }
            }
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
        .sheet(isPresented: $showSelfDelete) {
            NavigationStack {
                AccountDeletionView(deps: deps, onUnavailable: {
                    // Switched off between showing the row and submitting: email request instead.
                    showSelfDelete = false
                    selfDeleteEnabled = false
                    confirmDeleteAccount = true
                })
            }
        }
        .fullScreenCover(isPresented: $showAuth) {
            AuthFlowView(repo: deps.authRepository, config: deps.configService) { showAuth = false }
        }
        .task {
            let flag = (try? await deps.configService.config())?.flags.accountSelfDelete
            selfDeleteEnabled = AccountDeletion.usesInAppDeletion(flag: flag)
        }
    }

    private func select(_ lang: AppLanguage) {
        deps.localization.setLanguage(lang)
        Task { try? await ProfileService(api: deps.api).updateLanguage(lang.rawValue) }
    }

    /// Flag + the language named in itself (`AppLanguage.displayName`, which is exempt from localization on purpose).
    static func languageLabel(_ code: String) -> String {
        (code == "vi" ? "🇻🇳 " : "🇬🇧 ") + (AppLanguage(rawValue: code)?.displayName ?? code)
    }

    /// Opens the mail composer with the deletion request already written.
    ///
    /// 🚨 The app never deletes anything itself, and that is the published contract rather than a
    /// shortcut: /delete-account tells people support verifies ownership before erasing data, so a
    /// client-side delete would be a different promise from the one the store listing points
    /// reviewers at. `mailto:` resolves to mail clients only; when none is configured the failure
    /// says what to do instead of doing nothing (Android shows a toast).
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
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("settings.section.options")
            card {
                row(id: "notifications", icon: "bell.fill", accent: 0x3391FF, labelKey: "settings.notifications", desc: "settings.notifications.desc") {
                    router.push(ProfileDestination.notifications, on: .profile)
                }
                divider
                row(id: "memory", icon: "brain.head.profile", accent: 0x7C5CFF, labelKey: "settings.memory", desc: "settings.memory.desc") {
                    router.push(ProfileDestination.tappyKnows, on: .profile)
                }
                // App Store 1.2: the person can review and undo their blocks. Shown only while the server
                // has blocking on (`p8.userBlocks`, default off) and someone is signed in.
                if safety.flags.userBlocks && isSignedIn {
                    divider
                    row(id: "blocked", icon: "hand.raised.fill", accent: 0xF43F5E, labelKey: "safety.blocked.title", desc: "safety.blocked.desc") {
                        router.push(ProfileDestination.blockedAccounts, on: .profile)
                    }
                }
                divider
                row(id: "language", icon: "globe", accent: 0xFF9500, labelKey: "settings.language", desc: "settings.language.desc",
                    value: Self.languageLabel(localization.language.rawValue)) {
                    showLanguagePicker = true
                }
                divider
                row(id: "appearance", icon: "moon.fill", accent: 0x7C5CFF, labelKey: "settings.appearance", desc: "settings.appearance.desc",
                    valueKey: "settings.appearance." + theme.mode.rawValue) {
                    showAppearancePicker = true
                }
            }
        }
    }

    // MARK: - Other

    private var otherSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("settings.section.other")
            card {
                // Usage guidance sits with the reference documents: onboarding runs once and cannot
                // answer "how does this work?" afterwards.
                row(id: "guide", icon: "book.fill", accent: 0x3391FF, labelKey: "guide.settingsRow", desc: "settings.guide.desc") {
                    router.push(ProfileDestination.howToUse, on: .profile)
                }
                divider
                row(id: "terms", icon: "doc.text.fill", accent: 0x7C5CFF, labelKey: "settings.terms", desc: "settings.terms.desc") {
                    router.push(ProfileDestination.terms, on: .profile)
                }
                divider
                row(id: "privacy", icon: "shield.fill", accent: 0x34D399, labelKey: "settings.privacyPolicy", desc: "settings.privacyPolicy.desc") {
                    router.push(ProfileDestination.privacy, on: .profile)
                }
                divider
                // The general copyright / notice-and-takedown policy. Opens the web page rather than a
                // native screen so web, Android and iOS read ONE policy that cannot drift. (The native
                // music-copyright page is no longer reachable from here: Music is hidden.) App Review
                // expects a reachable copyright-report path for user content.
                row(id: "copyright", icon: "c.circle.fill", accent: 0x7C5CFF, labelKey: "settings.copyright", desc: "settings.copyright.desc") {
                    if let url = URL(string: TappyShare.canonicalOrigin + "/copyright") { UIApplication.shared.open(url) }
                }
                divider
                // ── Account deletion ── 🚨 REQUIRED BY APP STORE REVIEW GUIDELINE 5.1.1(v).
                // Request-based by default, identical to Android and to the public /delete-account page
                // (step 3 fixes this label word for word). Where the server offers it
                // (`flags.accountSelfDelete`) a signed-in user gets the in-app deletion instead; the
                // email request stays the fallback whenever the flag is off, absent, or off at submit.
                if selfDeleteEnabled && isSignedIn {
                    row(id: "delete", icon: "trash", accent: 0xF43F5E, labelKey: "settings.deleteAccountSelf", desc: "settings.deleteAccountSelf.desc") {
                        showSelfDelete = true
                    }
                } else {
                    row(id: "delete", icon: "trash", accent: 0xF43F5E, labelKey: "settings.deleteAccount", desc: "settings.deleteAccount.desc") {
                        confirmDeleteAccount = true
                    }
                }
            }
        }
    }

    // MARK: - Sign in / out

    private var signOutCard: some View {
        card {
            Button { showSignOutConfirm = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.portrait.and.arrow.right").font(.system(size: 15))
                    Text("settings.signOut").font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(Color(hex: 0xF43F5E))
                .frame(maxWidth: .infinity).padding(.vertical, 16)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("settings-signout")
        }
    }

    private var signInCard: some View {
        Button { showAuth = true } label: {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 14).fill(HomeV3.actionGradient).frame(width: 44, height: 44)
                    .overlay(Image(systemName: "person.crop.circle.fill").font(.system(size: 20)).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 2) {
                    Text("settings.signIn").font(.system(size: 16, weight: .bold)).foregroundStyle(HomeV3.onSurface)
                    Text("settings.signIn.desc").font(.system(size: 12.5)).foregroundStyle(HomeV3.onSurfaceVariant)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(HomeV3.onSurfaceVariant)
            }
            .padding(16)
            .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(HomeV3.purple.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("settings-signin")
    }

    // MARK: - Pieces

    private func sectionHeader(_ key: String) -> some View {
        Text(LocalizedStringKey(key)).font(.system(size: 11, weight: .semibold)).kerning(0.6)
            .foregroundStyle(HomeV3.onSurfaceVariant).padding(.horizontal, 4)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) { content() }
            .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(HomeV3.outline, lineWidth: 1))
    }

    private var divider: some View { HomeV3.outline.frame(height: 1).padding(.leading, 68) }

    /// One row: accent tile, title (follows the in-app language — `LocalizedStringKey`, not
    /// `String(localized:)`), a one-line description, an optional current value, a chevron.
    private func row(id: String, icon: String, accent: UInt, labelKey: String, desc: String,
                     value: String? = nil, valueKey: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 12).fill(Color(hex: accent, alpha: 0.16)).frame(width: 40, height: 40)
                    .overlay(Image(systemName: icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color(hex: accent)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(LocalizedStringKey(labelKey)).font(.system(size: 15, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                    Text(LocalizedStringKey(desc)).font(.system(size: 12.5)).foregroundStyle(HomeV3.onSurfaceVariant)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let value {
                    Text(value).font(.system(size: 13, weight: .medium)).foregroundStyle(HomeV3.onSurface)
                } else if let valueKey {
                    Text(LocalizedStringKey(valueKey)).font(.system(size: 13, weight: .medium)).foregroundStyle(HomeV3.onSurface)
                }
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(HomeV3.onSurfaceVariant.opacity(0.6))
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("settings-" + id)
    }
}
