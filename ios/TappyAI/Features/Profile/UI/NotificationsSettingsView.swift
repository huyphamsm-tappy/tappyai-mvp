import SwiftUI
import UserNotifications

struct NotificationsSettingsView: View {
    let deps: AppDependencies

    @State private var permissionStatus: UNAuthorizationStatus = .notDetermined
    @State private var subscribed = false
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                if permissionStatus == .denied {
                    deniedCard
                } else {
                    toggleCard
                    if subscribed { whatYouGetCard }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Thông báo")
        .navigationBarTitleDisplayMode(.inline)
        .task { await checkStatus() }
    }

    // MARK: - Denied

    private var deniedCard: some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            Image(systemName: "bell.slash")
                .font(.system(size: 18))
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 4) {
                Text("Thông báo đã bị tắt")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(TappyColor.textPrimary)
                Text("Vào Cài đặt → TappyAI → Thông báo để bật lại")
                    .font(.system(size: 12))
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Toggle

    private var toggleCard: some View {
        VStack(spacing: Spacing.md) {
            HStack(spacing: Spacing.md) {
                Image(systemName: "bell")
                    .font(.system(size: 16))
                    .foregroundStyle(.indigo)
                    .frame(width: 36, height: 36)
                    .background(Color.indigo.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Push Notification")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(subscribed ? "Đang bật — bạn sẽ nhận thông báo từ Tappy" : "Tắt — bật để nhận tin hay ho từ Tappy")
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)
                }

                Spacer()

                Toggle("", isOn: Binding(
                    get: { subscribed },
                    set: { _ in toggleNotification() }
                ))
                .labelsHidden()
                .tint(.indigo)
                .disabled(loading)
            }

            if let error {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(.red)
                    .padding(Spacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
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

    // MARK: - What you'll receive

    private var whatYouGetCard: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("BẠN SẼ NHẬN")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)

            VStack(alignment: .leading, spacing: 8) {
                notifRow("🌅", "Tóm tắt buổi sáng")
                notifRow("🛍️", "Ưu đãi hay ho gần bạn")
                notifRow("🍜", "Gợi ý ăn trưa/tối")
                notifRow("📅", "Nhắc nhở đặt chỗ")
                notifRow("📊", "Tóm tắt tuần")
            }

            Text("Không spam · Tối đa 2-3 thông báo/ngày")
                .font(.system(size: 10))
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func notifRow(_ emoji: String, _ text: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Text(emoji)
                .font(.system(size: 13))
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textPrimary)
        }
    }

    // MARK: - Actions

    private func checkStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permissionStatus = settings.authorizationStatus
        subscribed = settings.authorizationStatus == .authorized
    }

    private func toggleNotification() {
        loading = true
        error = nil
        Task {
            if subscribed {
                await deps.notificationManager.unsubscribe()
                subscribed = false
            } else {
                do {
                    let granted = try await deps.notificationManager.requestPermissionAndRegister()
                    subscribed = granted
                    if !granted {
                        error = "Quyền thông báo bị từ chối. Vui lòng bật trong Cài đặt."
                    }
                } catch {
                    self.error = "Không thể bật thông báo"
                }
            }
            loading = false
        }
    }
}
