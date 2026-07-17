import SwiftUI

struct ProfileMainView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var session: SessionStore

    @State private var profile: UserProfile?
    @State private var conversationCount = 0
    @State private var loading = true
    @State private var showProUpgrade = false

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
        .navigationTitle("Hồ sơ")
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
                    Text("\(conversationCount) cuộc trò chuyện")
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
            Text("TÀI KHOẢN")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                menuRow(icon: "person", label: "Tài khoản", desc: "Thông tin cá nhân", dest: .account)
                Divider().padding(.leading, 52)
                menuRow(icon: "bubble.left.and.bubble.right", label: "Lịch sử chat", desc: "Xem lại các cuộc trò chuyện", dest: .history)
                Divider().padding(.leading, 52)
                menuRow(icon: "calendar", label: "Lịch đặt chỗ", desc: "Đặt chỗ nhà hàng, spa, khách sạn", dest: .bookings)
                Divider().padding(.leading, 52)
                menuRow(icon: "heart", label: "Sở thích", desc: "Tùy chỉnh gợi ý cho bạn", dest: .preferences)
                Divider().padding(.leading, 52)
                menuRow(icon: "bookmark", label: "Đã lưu", desc: "Địa điểm & bài viết yêu thích", dest: .favorites)
                Divider().padding(.leading, 52)
                menuRow(icon: "arrow.down.right", label: "Theo dõi giá", desc: "Tappy báo khi giá xuống", dest: .priceWatches)
                Divider().padding(.leading, 52)
                menuRow(icon: "brain", label: "Tappy biết gì", desc: "Xem & quản lý bộ nhớ Tappy", dest: .tappyKnows)
                Divider().padding(.leading, 52)
                menuRow(icon: "link", label: "Kết nối", desc: "Liên kết ứng dụng bên ngoài", dest: .integrations)
                Divider().padding(.leading, 52)
                menuRow(icon: "star", label: "Bài đánh giá", desc: "Xem các review bạn đã viết", dest: nil, action: {
                    router.switchTo(.explore)
                })
                Divider().padding(.leading, 52)
                menuRow(icon: "person.3", label: "Ăn nhóm", desc: "Tạo nhóm đi ăn cùng bạn bè", dest: nil, action: {
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
                menuRow(icon: "crown", label: "Nâng cấp Pro", desc: "Tin nhắn không giới hạn & tính năng đầy đủ", dest: .subscription)
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
            Text("CÀI ĐẶT")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                menuRow(icon: "gearshape", label: "Cài đặt", desc: "Ngôn ngữ, thông báo, quyền riêng tư", dest: .settings)
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
    private func menuRow(icon: String, label: String, desc: String, dest: ProfileDestination?, action: (() -> Void)? = nil) -> some View {
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
        p.fullName.components(separatedBy: " ").last ?? p.email.components(separatedBy: "@").first ?? "bạn"
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
            }
        } catch {
            profile = UserProfile(fullName: "", avatarUrl: "", email: "", bio: "")
        }
        loading = false
    }
}
