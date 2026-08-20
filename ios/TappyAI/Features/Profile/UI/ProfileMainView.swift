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

    private var service: ProfileService { ProfileService(api: deps.api) }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if let profile {
                    profileCard(profile)
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
            qrButton(p)
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
    private func qrButton(_ p: UserProfile) -> some View {
        Button {
            // QR share - uses native share sheet
            let link = "https://tappyai.vn/users/\(session.userId ?? "")"
            let av = UIActivityViewController(activityItems: [link], applicationActivities: nil)
            if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let root = scene.windows.first?.rootViewController {
                root.present(av, animated: true)
            }
        } label: {
            Image(systemName: "qrcode")
                .font(.system(size: 18))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(width: 40, height: 40)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
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
                // 🚨 Was `router.switchTo(.explore)`, which took "xem các review BẠN đã viết" to
                // the PUBLIC feed — everyone's posts, and by construction none of the author's own
                // held ones, since the gate keeps those out of Explore. The row promised the
                // author's own posts and delivered the opposite. `.myPosts` is that screen.
                menuRow(icon: "star", label: "profile.row.myPosts", desc: "profile.row.myPosts.desc", dest: .myPosts)
                Divider().padding(.leading, 52)
                menuRow(icon: "bell", label: "profile.row.notifications", desc: "profile.row.notifications.desc", dest: .notificationsInbox)
                Divider().padding(.leading, 52)
                menuRow(icon: "magnifyingglass", label: "profile.row.userSearch", desc: "profile.row.userSearch.desc", dest: .userSearch)
                Divider().padding(.leading, 52)
                menuRow(icon: "person.3", label: "profile.row.groupDining", desc: "profile.row.groupDining.desc", dest: nil, action: {
                    openGroupDining()
                })
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
            if let action {
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
                    Text(desc)
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

    private func openGroupDining() {
        guard let url = URL(string: "https://tappyai.vn/group/new") else { return }
        UIApplication.shared.open(url)
    }

    private func loadProfile() async {
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
