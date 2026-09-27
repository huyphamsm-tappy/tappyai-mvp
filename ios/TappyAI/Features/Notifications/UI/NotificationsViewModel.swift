import Foundation
import Supabase

@MainActor
final class NotificationsViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    @AppPublished var state: LoadState = .idle
    @AppPublished var items: [NotificationDTO] = []
    @AppPublished var unreadCount: Int = 0

    private let service: NotificationsService
    private let supabase: SupabaseClient
    private let userId: String?
    private let log = AppLogger.app
    private var realtimeTask: Task<Void, Never>?
    private var refetchDebounce: Task<Void, Never>?

    init(service: NotificationsService, supabase: SupabaseClient, userId: String?) {
        self.service = service
        self.supabase = supabase
        self.userId = userId
    }

    func load() async {
        state = .loading
        do {
            let response = try await service.fetchNotifications()
            items = response.notifications
            unreadCount = response.unreadCount
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
    /// Uses the `RealtimePostgresFilter` API of supabase-swift 2.55 (the raw-string `filter:`
    /// overload is deprecated). The filter is the same `user_id=eq.<uid>` Web subscribes with; RLS
    /// already limits delivery to this user's rows, so the events received are unchanged.
    /// `load()` above works standalone via pull-to-refresh regardless of whether this succeeds.
    func startRealtimeIfPossible() {
        guard let userId, realtimeTask == nil else { return }
        realtimeTask = Task { [weak self] in
            guard let self else { return }
            let channel = self.supabase.channel("notifications:\(userId)")
            let changes = channel.postgresChange(
                AnyAction.self,
                schema: "public",
                table: "notifications",
                filter: .eq("user_id", value: userId)
            )
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
