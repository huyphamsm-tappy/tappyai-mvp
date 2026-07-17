import SwiftUI
import Supabase

struct AccountView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var profile: UserProfile?
    @State private var createdAt: String?
    @State private var loading = true

    private var service: ProfileService { ProfileService(api: deps.api) }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if let profile {
                    avatarCard(profile)
                    infoSection(profile)
                    editSection
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Tài khoản")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    @ViewBuilder
    private func avatarCard(_ p: UserProfile) -> some View {
        VStack(spacing: Spacing.md) {
            if let url = URL(string: p.avatarUrl), !p.avatarUrl.isEmpty {
                AsyncImage(url: url) { img in
                    img.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color.gray.opacity(0.2)
                }
                .frame(width: 80, height: 80)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            } else {
                RoundedRectangle(cornerRadius: Radius.xl)
                    .fill(LinearGradient(colors: [TappyColor.primary, TappyColor.primary.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 80, height: 80)
                    .overlay(
                        Text(String(firstName(p).prefix(1)).uppercased())
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(.white)
                    )
            }
            Text(p.fullName.isEmpty ? firstName(p) : p.fullName)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(TappyColor.textPrimary)
            Text(p.email)
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func infoSection(_ p: UserProfile) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("THÔNG TIN")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            VStack(spacing: 0) {
                infoRow(icon: "person", label: "Họ và tên", value: p.fullName.isEmpty ? "Chưa cập nhật" : p.fullName)
                Divider().padding(.leading, 52)
                infoRow(icon: "envelope", label: "Email", value: p.email)
                if let date = createdAt {
                    Divider().padding(.leading, 52)
                    infoRow(icon: "calendar", label: "Ngày tham gia", value: date)
                }
            }
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    private var editSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("CHỈNH SỬA")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.horizontal, 2)

            Button {
                router.push(ProfileDestination.editProfile, on: .profile)
            } label: {
                HStack(spacing: Spacing.md) {
                    Image(systemName: "pencil")
                        .font(.system(size: 15))
                        .foregroundStyle(TappyColor.textSecondary)
                        .frame(width: 32, height: 32)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Chỉnh sửa hồ sơ")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(TappyColor.textPrimary)
                        Text("Đổi tên hiển thị, ảnh đại diện")
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary)
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
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private func infoRow(icon: String, label: String, value: String) -> some View {
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
                Text(value)
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
    }

    private func firstName(_ p: UserProfile) -> String {
        p.fullName.components(separatedBy: " ").last ?? p.email.components(separatedBy: "@").first ?? "bạn"
    }

    private func loadData() async {
        do {
            profile = try await service.fetchProfile()
            if let session = try? await deps.supabase.auth.session {
                let df = DateFormatter()
                df.locale = Locale(identifier: "vi_VN")
                df.dateStyle = .long
                createdAt = df.string(from: session.user.createdAt)
            }
        } catch {
            profile = UserProfile(fullName: "", avatarUrl: "", email: "", bio: "")
        }
        loading = false
    }
}
