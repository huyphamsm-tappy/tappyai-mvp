import Foundation
import Supabase

/// App-scoped unread-notification count (ADR-014).
///
/// Mirrors Web's `NotificationProvider`: the count and its live subscription live at the ROOT, not inside one screen. On Web the
/// badge was once owned by one page and stopped updating off that route; a per-screen count on iOS (`NotificationsViewModel`) would
/// do the same, so the tab bar reads this store, owned by `AppDependencies`.
///
/// Only a signed-in person has notifications: a guest or a signed-out phone reads 0 and holds no subscription. Realtime is
/// best-effort — `refresh()` alone keeps the badge right on launch, on foreground and after an inbox visit.
@MainActor
final class NotificationCenterStore: AppObservableObject {
    @AppPublished private(set) var unreadCount: Int = 0
    /// The unread MESSAGES (Messenger), from `GET /api/messaging/unread`, and how many of the unread notifications are message
    /// notifications. Separate numbers, each from its own source; `badgeCount` is the one the tab bar shows.
    @AppPublished private(set) var messageUnread: ChatUnread = .zero

    /// The tab-bar badge: the other notifications plus the unread messages, a message counted once (the web's `badgeTotal`).
    var badgeCount: Int { ChatUnread.badgeTotal(notificationUnread: unreadCount, unread: messageUnread) }

    private let service: NotificationsService
    private let messaging: MessagingService?
    private let supabase: SupabaseClient?
    private let session: SessionStore
    private let log = AppLogger.app
    private var realtimeTask: Task<Void, Never>?
    private var messagesRealtimeTask: Task<Void, Never>?
    private var realtimeUserId: String?
    private var refreshDebounce: Task<Void, Never>?

    /// `supabase` is nil where no live connection is wanted (tests): the count still works by `refresh()`. `messaging` is nil where the unread
    /// messages are not wanted (tests): the badge then counts the notifications alone, exactly as before.
    init(service: NotificationsService, supabase: SupabaseClient?, session: SessionStore, messaging: MessagingService? = nil) {
        self.service = service
        self.messaging = messaging
        self.supabase = supabase
        self.session = session
    }

    func refresh() async {
        guard session.state.isAuthenticated else {
            unreadCount = 0
            messageUnread = .zero
            return
        }
        let userId = session.userId
        do {
            // limit 1: only the count matters here; the inbox fetches the real page.
            let count = try await service.fetchNotifications(limit: 1).unreadCount
            // The person may have signed out, or another person in, while the request ran: that answer is not theirs.
            guard session.state.isAuthenticated, session.userId == userId else { return }
            unreadCount = count
        } catch {
            log.error("unread badge refresh failed: \(error)")
        }
        // The unread messages: a failed read keeps the last number (the badge shows nothing wrong rather than a wrong number).
        if let messaging, let unread = try? await messaging.unread(), session.state.isAuthenticated, session.userId == userId {
            messageUnread = unread
        }
    }

    /// The person signed in or out (or the app started): count for the one signed in, hold nothing for nobody.
    func sessionChanged() async {
        if session.state.isAuthenticated {
            await refresh()
            startRealtimeIfPossible()
        } else {
            stopRealtime()
            unreadCount = 0
            messageUnread = .zero
        }
    }

    /// The badge reacts at once when the person reads everything; the next `refresh()` reconciles with the server.
    func markAllReadLocally() {
        unreadCount = 0
    }

    /// Same Realtime calls as `NotificationsViewModel.startRealtimeIfPossible()`. A subscription of another person's is dropped first.
    func startRealtimeIfPossible() {
        guard let supabase, session.state.isAuthenticated, let userId = session.userId else { return }
        if realtimeTask != nil, realtimeUserId == userId { return }
        stopRealtime()
        realtimeUserId = userId
        realtimeTask = Task { [weak self] in
            let channel = supabase.channel("notifications-badge:\(userId)")
            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "notifications")
            do {
                try await channel.subscribeWithError()
            } catch {
                self?.log.error("badge realtime subscribe failed: \(error)")
                return
            }
            for await _ in changes {
                guard !Task.isCancelled else { return }
                self?.scheduleRefresh()
            }
        }
        // A new message re-reads the badge too. The subscription is the one the Inbox's own list would use: unfiltered, scoped to the
        // person's conversations by row-level security. Best effort — `refresh()` on launch, on foreground and after a visit keeps it right.
        guard messaging != nil else { return }
        messagesRealtimeTask = Task { [weak self] in
            let channel = supabase.channel("messages-badge:\(userId)")
            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "chat_messages")
            do {
                try await channel.subscribeWithError()
            } catch {
                self?.log.error("messages badge realtime subscribe failed: \(error)")
                return
            }
            for await _ in changes {
                guard !Task.isCancelled else { return }
                self?.scheduleRefresh()
            }
        }
    }

    func stopRealtime() {
        realtimeTask?.cancel()
        realtimeTask = nil
        messagesRealtimeTask?.cancel()
        messagesRealtimeTask = nil
        realtimeUserId = nil
        refreshDebounce?.cancel()
        refreshDebounce = nil
    }

    private func scheduleRefresh() {
        refreshDebounce?.cancel()
        refreshDebounce = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
