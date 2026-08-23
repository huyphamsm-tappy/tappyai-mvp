import SwiftUI

/// The real in-app notification inbox (ADR-014) — distinct from `NotificationsSettingsView`,
/// which only toggles push permission. Previously TappyAI had no in-app inbox at all on iOS
/// (push-registration only); this closes that gap.
struct NotificationsInboxView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    /// The unread count is read from the app-scoped store, not from the view model — one number,
    /// one owner, and this view re-renders when the badge does.
    @AppEnvironmentState private var unreadNotifications: UnreadNotificationsStore
    @AppStateObject private var vm: NotificationsViewModel

    init(deps: AppDependencies) {
        self.deps = deps
        _vm = AppStateObject(wrappedValue: NotificationsViewModel(
            service: NotificationsService(api: deps.api),
            supabase: deps.supabase,
            userId: deps.session.userId,
            unread: deps.unreadNotifications
        ))
    }

    var body: some View {
        Group {
            switch vm.state {
            case .idle, .loading:
                ProgressView().frame(maxWidth: .infinity, minHeight: 200)
            case .failed:
                TappyErrorState(
                    presentation: .init(title: NSLocalizedString("common.loadFailed", comment: ""), message: NSLocalizedString("common.tryAgainLater", comment: ""), retryable: true),
                    onRetry: { Task { await vm.load() } }
                )
                .padding(.top, 60)
            case .loaded:
                if vm.items.isEmpty {
                    TappyEmptyState(systemImage: "bell", title: "notif.inbox.empty")
                        .padding(.top, 60)
                } else {
                    list
                }
            }
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("notif.title", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if unreadNotifications.unreadCount > 0 {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(NSLocalizedString("notif.markAllRead", comment: "")) { vm.markAllRead() }
                        .font(.system(size: 13, weight: .medium))
                }
            }
        }
        .task {
            await vm.load()
            vm.startRealtimeIfPossible()
        }
        .onDisappear { vm.stopRealtime() }
        .refreshable { await vm.load() }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(vm.items) { item in
                    row(item)
                    Divider().padding(.leading, 60)
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ item: NotificationDTO) -> some View {
        Button {
            navigate(item)
        } label: {
            HStack(alignment: .top, spacing: Spacing.sm) {
                avatar(item.actor?.avatar)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.system(size: 14, weight: item.isUnread ? .semibold : .regular))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(item.body)
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                        .lineLimit(2)
                    Text(ago(item.createdAt))
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary.opacity(0.7))
                }
                Spacer()

                if item.isUnread {
                    Circle().fill(TappyColor.primary).frame(width: 8, height: 8)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .background(item.isUnread ? TappyColor.primary.opacity(0.04) : Color.clear)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func avatar(_ url: String?) -> some View {
        Group {
            if let url, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image): image.resizable().aspectRatio(contentMode: .fill)
                    default: defaultAvatar
                    }
                }
            } else {
                defaultAvatar
            }
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
    }

    private var defaultAvatar: some View {
        Circle()
            .fill(TappyColor.surface)
            .overlay(Image(systemName: "bell.fill").font(.system(size: 14)).foregroundStyle(TappyColor.textSecondary))
    }

    private func navigate(_ item: NotificationDTO) {
        guard let path = item.entityUrl, let target = deps.deepLinks.target(for: path) else { return }
        router.handle(target)
    }
}
