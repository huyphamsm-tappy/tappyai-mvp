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

    private let service: NotificationsService
    private let supabase: SupabaseClient?
    private let session: SessionStore
    private let log = AppLogger.app
    private var realtimeTask: Task<Void, Never>?
    private var realtimeUserId: String?
    private var refreshDebounce: Task<Void, Never>?

    /// `supabase` is nil where no live connection is wanted (tests): the count still works by `refresh()`.
    init(service: NotificationsService, supabase: SupabaseClient?, session: SessionStore) {
        self.service = service
        self.supabase = supabase
        self.session = session
    }

    func refresh() async {
        guard session.state.isAuthenticated else {
            unreadCount = 0
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
    }

    /// The person signed in or out (or the app started): count for the one signed in, hold nothing for nobody.
    func sessionChanged() async {
        if session.state.isAuthenticated {
            await refresh()
            startRealtimeIfPossible()
        } else {
            stopRealtime()
            unreadCount = 0
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
                await supabase.removeChannel(channel)
                return
            }
            for await _ in changes {
                guard !Task.isCancelled else { break }
                self?.scheduleRefresh()
            }
            // 03/11: cancelling the task only stopped listening; the channel stayed joined (and registered on the client), so every
            // sign-out/sign-in left another live subscription behind. Leave it for real.
            await supabase.removeChannel(channel)
        }
    }

    func stopRealtime() {
        realtimeTask?.cancel()
        realtimeTask = nil
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
