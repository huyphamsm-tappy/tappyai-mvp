import SwiftUI

/// The Inbox: the web's two tabs, "Tin nhắn" (people talking to you) and "Thông báo" (the system talking to you). Each tab shows ITS OWN
/// count, read from ITS OWN source — the unread messages from `/api/messaging/unread`, the unread notifications from the notification store
/// — and neither is derived from the other. The notification list itself is the existing `NotificationsInboxView`, untouched.
struct InboxContainerView: View {
    enum Tab: Hashable { case messages, notifications }

    let deps: AppDependencies
    @ObservedObject private var center: NotificationCenterStore
    @State private var tab: Tab

    /// `initial`: a message notification's link opens on the messages tab; everything else on notifications.
    init(deps: AppDependencies, initial: Tab = .messages) {
        self.deps = deps
        _center = ObservedObject(wrappedValue: deps.notificationCenter)
        _tab = State(initialValue: initial)
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text(label("msg.tab.messages", count: center.messageUnread.messages)).tag(Tab.messages)
                Text(label("msg.tab.notifications", count: center.unreadCount)).tag(Tab.notifications)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.xs)
            .accessibilityIdentifier("inbox-tabs")

            switch tab {
            case .messages:
                MessagesListView(deps: deps)
            case .notifications:
                NotificationsInboxView(deps: deps)
            }
        }
        .background(TappyColor.background)
        .navigationTitle(Text("msg.inbox.title"))
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { Task { await center.refresh() } }
    }

    /// "Tin nhắn" or "Tin nhắn (3)": zero renders nothing rather than a "0".
    private func label(_ key: String, count: Int) -> String {
        let base = NSLocalizedString(key, comment: "")
        return count > 0 ? "\(base) (\(count))" : base
    }
}
