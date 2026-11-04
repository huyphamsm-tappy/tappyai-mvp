import SwiftUI

/// The real in-app notification inbox (ADR-014) — distinct from `NotificationsSettingsView`,
/// which only toggles push permission. Previously TappyAI had no in-app inbox at all on iOS
/// (push-registration only); this closes that gap.
struct NotificationsInboxView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var notificationCenter: NotificationCenterStore
    @AppStateObject private var vm: NotificationsViewModel

    init(deps: AppDependencies) {
        self.deps = deps
        _vm = AppStateObject(wrappedValue: NotificationsViewModel(
            service: NotificationsService(api: deps.api),
            supabase: deps.supabase,
            userId: deps.session.userId
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
            if vm.unreadCount > 0 {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(NSLocalizedString("notif.markAllRead", comment: "")) {
                        vm.markAllRead()
                        notificationCenter.markAllReadLocally()
                    }
                        .font(.system(size: 13, weight: .medium))
                }
            }
        }
        .task {
            await vm.load()
            vm.startRealtimeIfPossible()
        }
        .onDisappear {
            vm.stopRealtime()
            // Reconcile the tab badge with the server after the visit (rows read one by one, or new ones that arrived).
            Task { await notificationCenter.refresh() }
        }
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
                    // A collapsed message row stands for `count` unread messages: the web's "N tin nhắn mới" replaces its own text.
                    Text(Self.bodyText(for: item))
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

    /// The second line of a row: "N tin nhắn mới" for a collapsed message row with more than one unread message, else the row's own text.
    static func bodyText(for item: NotificationDTO) -> String {
        if let count = item.messageCount, count > 1 {
            return String(format: NSLocalizedString("notif.newMessages", comment: ""), count)
        }
        return item.body
    }

    private func navigate(_ item: NotificationDTO) {
        guard let path = item.entityUrl, let target = deps.deepLinks.target(for: path) else { return }
        router.handle(target)
    }
}
