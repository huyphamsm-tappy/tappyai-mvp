import SwiftUI

struct ProfileMainView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var session: SessionStore

    @State private var profile: UserProfile?
    @State private var conversationCount = 0
    /// The count is shown only once `/api/conversations` actually answered.
    @State private var conversationsLoaded = false
    @State private var loading = true
    @State private var showProUpgrade = false
    @State private var showAppConnections = false
    @State private var showQR = false
    @State private var showCompose = false
    @StateObject private var hub: ProfileHubViewModel

    init(deps: AppDependencies) {
        self.deps = deps
        _hub = StateObject(wrappedValue: ProfileHubViewModel(api: deps.api))
    }

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
                    // Signed in: the web `/profile` hero + content tabs (Android `ProfileHubV3`).
                    ProfileHeroView(profile: profile, stats: hub.stats, likes: hub.likes,
                                    onEdit: { router.push(ProfileDestination.editProfile, on: .profile) },
                                    onQR: { showQR = true })
                    ProfileHubContentPanel(
                        vm: hub,
                        onOpenReview: { router.push(ReviewsDestination.reviewDetail(id: $0), on: .profile) },
                        onOpenPlace: { _ in router.push(ProfileDestination.favorites, on: .profile) },
                        onCompose: { showCompose = true })
                    accountSection
                    if showProUpgrade { proSection }
                    settingsSection
                    ProfileInfoCard(profile: profile,
                                    onEdit: { router.push(ProfileDestination.editProfile, on: .profile) })
                    ProfileStatsCard(vm: hub, conversations: conversationsLoaded ? conversationCount : nil)
                    ProfileFollowingCard(following: hub.following,
                                         onOpen: { router.push(ReviewsDestination.userProfile(id: $0), on: .profile) },
                                         onSeeAll: { router.push(ProfileDestination.social, on: .profile) })
                    ProfileQrCard(onShowQr: { showQR = true })
                    communityShortcuts
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle(Text("profile.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadProfile()
            await hub.load(userId: session.userId)
        }
        // Signing in or out while this tab is on screen: show the right state at once, never a half one.
        .onChange(of: session.state) { _ in
            profile = nil
            loading = true
            Task {
                await loadProfile()
                await hub.load(userId: session.userId, force: true)
            }
        }
        .refreshable {
            await loadProfile()
            await hub.load(userId: session.userId, force: true)
        }
        .fullScreenCover(isPresented: $showCompose) {
            CreateReviewView(deps: deps)
        }
        .sheet(isPresented: $showQR) {
            if let url = ProfileQR.profileURL(userId: session.userId) {
                ProfileQRView(url: url, displayName: profile?.fullName ?? "")
            }
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
            Button { router.requestLogin() } label: {
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

    // MARK: - Account Section

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("profile.section.account")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                // Three short rows, like «Cài đặt»: the personal sections (details, bookings, preferences,
                // price tracking, AI plans, what Tappy knows, group dining) sit one level down in
                // `AccountMenuView`. Nothing was removed, only grouped.
                menuRow(icon: "person", label: "profile.row.account", desc: "profile.row.account.menuDesc", dest: .accountMenu)
                    .accessibilityIdentifier("hub-account")
                Divider().padding(.leading, 52)
                menuRow(icon: "bubble.left.and.bubble.right", label: "profile.row.history", desc: "profile.row.history.desc", dest: .history)
                Divider().padding(.leading, 52)
                menuRow(icon: "bookmark", label: "profile.row.saved", desc: "profile.row.saved.desc", dest: .favorites)
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
                router.requestLogin()
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
            conversationsLoaded = convs != nil
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
