import SwiftUI

struct ProfileMainView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var session: SessionStore

    @State private var profile: UserProfile?
    @State private var conversationCount = 0
    @State private var loading = true
    @State private var showProUpgrade = false
    @State private var showAppConnections = false
    @State private var showQR = false
    @State private var showAuth = false

    /// Signed-out (anonymous) visitor: the hub shows the sign-in card and locks every row, as the
    /// web `/profile` and Android do (ANDROID-PARITY-MAP L3).
    private var isGuest: Bool { !session.state.isAuthenticated }

    private var service: ProfileService { ProfileService(api: deps.api) }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if isGuest {
                    guestCard
                    accountSection
                    settingsSection
                } else if let profile {
                    profileCard(profile)
                    communityShortcuts
                    accountSection
                    if showProUpgrade { proSection }
                    settingsSection
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle(Text("profile.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadProfile() }
        .fullScreenCover(isPresented: $showAuth) {
            AuthFlowView(repo: deps.authRepository, config: deps.configService) { showAuth = false }
        }
    }

    // MARK: - Guest card

    private var guestCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(spacing: Spacing.md) {
                RoundedRectangle(cornerRadius: Radius.xl)
                    .fill(LinearGradient(colors: [Color(hex: 0x8B5CF6, alpha: 0.3), TappyColor.primary.opacity(0.25)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 64, height: 64)
                    .overlay(Text("👋").font(.system(size: 30)))
                VStack(alignment: .leading, spacing: 4) {
                    Text("profile.guest.title")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("profile.guest.subtitle")
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
            Button { showAuth = true } label: {
                Text("profile.guest.signIn")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("profile-guest-signin")
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("profile-guest-card")
    }

    // MARK: - Community shortcuts (the rows the web/Android hub dropped stay one tap away)

    private var communityShortcuts: some View {
        HStack(spacing: Spacing.sm) {
            shortcut("star", "profile.row.myPosts", .myPosts)
            shortcut("person.2", "profile.row.social", .social)
            shortcut("magnifyingglass", "profile.row.userSearch", .userSearch)
            shortcut("bell", "profile.row.notifications", .notificationsInbox)
        }
    }

    private func shortcut(_ icon: String, _ label: LocalizedStringKey, _ dest: ProfileDestination) -> some View {
        Button { router.push(dest, on: .profile) } label: {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 16))
                Text(label).font(.system(size: 10, weight: .medium)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(TappyColor.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.sm)
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).stroke(TappyColor.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Profile Card

    @ViewBuilder
    private func profileCard(_ p: UserProfile) -> some View {
        HStack(spacing: Spacing.md) {
            avatarView(p)
            VStack(alignment: .leading, spacing: 4) {
                Text(p.fullName.isEmpty ? firstName(p) : p.fullName)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
                Text(p.email)
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(1)
                HStack(spacing: Spacing.xs) {
                    Text("profile.conversationCount \(conversationCount)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(TappyColor.primary)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 3)
                        .background(TappyColor.primary.opacity(0.08))
                        .clipShape(Capsule())
                }
            }
            Spacer()
            // No user id, no profile page to point at: the button is hidden rather than sharing
            // a link that opens nothing.
            if let url = ProfileQR.profileURL(userId: session.userId) {
                qrButton(url)
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func avatarView(_ p: UserProfile) -> some View {
        if let url = URL(string: p.avatarUrl), !p.avatarUrl.isEmpty {
            AsyncImage(url: url) { img in
                img.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Color.gray.opacity(0.2)
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        } else {
            RoundedRectangle(cornerRadius: Radius.xl)
                .fill(LinearGradient(colors: [TappyColor.primary, TappyColor.primary.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 64, height: 64)
                .overlay(
                    Text(String(firstName(p).prefix(1)).uppercased())
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.white)
                )
        }
    }

    @ViewBuilder
    private func qrButton(_ url: URL) -> some View {
        // Was a bare share sheet with `https://tappyai.vn/users/…` — a non-canonical host and no
        // code to scan. Now the web's "Share profile": the QR of the canonical profile URL plus
        // a share button (`ProfileQRView`).
        Button {
            showQR = true
        } label: {
            Image(systemName: "qrcode")
                .font(.system(size: 18))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(width: 40, height: 40)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("qr.title"))
        .sheet(isPresented: $showQR) {
            ProfileQRView(url: url)
        }
    }

    // MARK: - Account Section

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("profile.section.account")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                menuRow(icon: "person", label: "profile.row.account", desc: "profile.row.account.desc", dest: .account)
                Divider().padding(.leading, 52)
                menuRow(icon: "bubble.left.and.bubble.right", label: "profile.row.history", desc: "profile.row.history.desc", dest: .history)
                Divider().padding(.leading, 52)
                menuRow(icon: "calendar", label: "profile.row.bookings", desc: "profile.row.bookings.desc", dest: .bookings)
                Divider().padding(.leading, 52)
                menuRow(icon: "heart", label: "profile.row.preferences", desc: "profile.row.preferences.desc", dest: .preferences)
                Divider().padding(.leading, 52)
                menuRow(icon: "bookmark", label: "profile.row.saved", desc: "profile.row.saved.desc", dest: .favorites)
                Divider().padding(.leading, 52)
                menuRow(icon: "arrow.down.right", label: "profile.row.priceWatch", desc: "profile.row.priceWatch.desc", dest: .priceWatches)
                Divider().padding(.leading, 52)
                menuRow(icon: "map", label: "profile.row.planner", desc: "profile.row.planner.desc", dest: .planner)
                Divider().padding(.leading, 52)
                menuRow(icon: "brain", label: "profile.row.memory", desc: "profile.row.memory.desc", dest: .tappyKnows)
                Divider().padding(.leading, 52)
                // Kết nối (App Connections) gated by the backend flag, mirroring Web's
                // `{SHOW_APP_CONNECTIONS && <MenuItem integrations/>}`. Currently hidden
                // (flag false, owner decision 2026-07-17); the screen/APIs stay intact
                // and re-appear the moment the flag flips — no app release needed.
                if showAppConnections {
                    menuRow(icon: "link", label: "profile.row.integrations", desc: "profile.row.integrations.desc", dest: .integrations)
                    Divider().padding(.leading, 52)
                }
                // My posts / notifications / following / people search moved to `communityShortcuts`
                // (web and Android hubs have exactly the nine rows of the mockup).
                menuRow(icon: "person.3", label: "profile.row.groupDining", desc: "profile.row.groupDining.desc", dest: .groupDining)
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Pro Section (visible only when showProUpgrade is true from /api/config)

    private var proSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("PRO")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                menuRow(icon: "crown", label: "profile.row.pro", desc: "profile.row.pro.desc", dest: .subscription)
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Settings Section

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("profile.section.settings")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                menuRow(icon: "gearshape", label: "profile.row.settings", desc: "profile.row.settings.desc", dest: .settings)
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Menu Row

    @ViewBuilder
    /// A profile menu row.
    ///
    /// [label] and [desc] are `LocalizedStringKey`, not `String`: SwiftUI resolves a literal in
    /// that position through the catalogue, so passing a key is the whole conversion and passing
    /// prose still compiles — which is exactly how the Vietnamese ended up hardcoded here. The
    /// type change is what makes the next row hard to get wrong.
    private func menuRow(icon: String, label: LocalizedStringKey, desc: LocalizedStringKey, dest: ProfileDestination?, action: (() -> Void)? = nil) -> some View {
        Button {
            if isGuest {
                showAuth = true
            } else if let action {
                action()
            } else if let dest {
                router.push(dest, on: .profile)
            }
        } label: {
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
                    Text(isGuest ? LocalizedStringKey("profile.guest.locked") : desc)
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)
                        .lineLimit(1)
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

    // MARK: - Helpers

    private func firstName(_ p: UserProfile) -> String {
        p.fullName.components(separatedBy: " ").last ?? p.email.components(separatedBy: "@").first ?? NSLocalizedString("profile.fallbackName", comment: "")
    }

    private func loadProfile() async {
        if isGuest { loading = false; return }
        do {
            let p = try await service.fetchProfile()
            profile = p
            let convs = try? await service.fetchConversations()
            conversationCount = convs?.count ?? 0
            if let cfg = try? await deps.configService.config() {
                showProUpgrade = cfg.flags.showProUpgrade
                showAppConnections = cfg.flags.showAppConnections ?? false
            }
        } catch {
            profile = UserProfile(fullName: "", avatarUrl: "", email: "", bio: "")
        }
        loading = false
    }
}
