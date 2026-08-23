import Foundation
import Supabase

@MainActor
final class NotificationsViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    @AppPublished var state: LoadState = .idle
    @AppPublished var items: [NotificationDTO] = []

    private let service: NotificationsService
    private let supabase: SupabaseClient
    private let userId: String?
    /// The app-scoped owner of the unread count. This view model deliberately keeps no copy of its
    /// own: a badge and a screen disagreeing is exactly what a second count produces. Views that
    /// need the number read `UnreadNotificationsStore` from the environment.
    private let unread: UnreadNotificationsStore
    private let log = AppLogger.app
    private var realtimeTask: Task<Void, Never>?
    private var refetchDebounce: Task<Void, Never>?

    init(service: NotificationsService,
         supabase: SupabaseClient,
         userId: String?,
         unread: UnreadNotificationsStore) {
        self.service = service
        self.supabase = supabase
        self.userId = userId
        self.unread = unread
    }

    func load() async {
        state = .loading
        do {
            let response = try await service.fetchNotifications()
            items = response.notifications
            // The inbox has just paid for an authoritative count — hand it to the badge rather
            // than making the store fetch the same endpoint again.
            unread.apply(unreadCount: response.unreadCount)
            state = .loaded
        } catch {
            state = Task.isCancelled ? .idle : .failed
            log.error("notifications load failed: \(error)")
        }
    }

    func markAllRead() {
        let hadUnread = items.contains { $0.isUnread }
        guard hadUnread else { return }
        Task {
            do {
                try await service.markRead()
                // Clear before the refetch so the badge drops the moment the server accepted it,
                // rather than lingering for the round trip. `load()` then reconciles both the rows
                // and the count against the server's answer.
                unread.clear()
                await load()
            } catch {
                log.error("mark-all-read failed: \(error)")
            }
        }
    }

    /// Subscribes to Postgres changes on this user's `notifications` rows and debounce-refetches
    /// (ADR-014: the client re-fetches the REST endpoint rather than trusting the realtime payload
    /// as state directly — same pattern as Web's `NotificationProvider`).
    ///
    /// UNVERIFIED — the exact `supabase-swift` v2 Realtime channel/postgresChange API surface has
    /// not been confirmed against a real compile in this environment (no Mac/Xcode here; same
    /// class of risk already flagged for the Auth SDK calls in `SupabaseAuthService`). If the API
    /// differs by version, this method is the one place to fix — `load()` above works standalone
    /// via plain polling/pull-to-refresh regardless of whether this succeeds.
    func startRealtimeIfPossible() {
        guard let userId, realtimeTask == nil else { return }
        realtimeTask = Task { [weak self] in
            guard let self else { return }
            let channel = self.supabase.channel("notifications:\(userId)")
            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "notifications")
            do {
                try await channel.subscribeWithError()
            } catch {
                self.log.error("notifications realtime subscribe failed: \(error)")
                return
            }
            for await _ in changes {
                self.scheduleRefetch()
            }
        }
    }

    func stopRealtime() {
        realtimeTask?.cancel()
        realtimeTask = nil
    }

    private func scheduleRefetch() {
        refetchDebounce?.cancel()
        refetchDebounce = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await self?.load()
        }
    }
}
