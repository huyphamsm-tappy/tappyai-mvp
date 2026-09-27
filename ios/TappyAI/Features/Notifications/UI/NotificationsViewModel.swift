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
    /// The subscribed channel, kept so closing the inbox can unsubscribe and remove it. Cancelling
    /// the listening task alone left the channel registered on the client, subscribed, under the
    /// same topic the next open creates again.
    private var channel: RealtimeChannelV2?
    /// A removal still in flight from the previous close; the next open waits for it, so two
    /// channels with the same topic never coexist.
    private var removal: Task<Void, Never>?

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
        let pendingRemoval = removal
        realtimeTask = Task { [weak self] in
            await pendingRemoval?.value
            guard let self, !Task.isCancelled else { return }
            let channel = self.supabase.channel("notifications:\(userId)")
            self.channel = channel
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

    /// Called when the inbox closes: stop listening AND unsubscribe + remove the channel from the
    /// client (`removeChannel` unsubscribes first), so the next open starts from a clean slate.
    func stopRealtime() {
        realtimeTask?.cancel()
        realtimeTask = nil
        refetchDebounce?.cancel()
        refetchDebounce = nil
        guard let channel else { return }
        self.channel = nil
        let supabase = self.supabase
        removal = Task {
            await supabase.removeChannel(channel)
        }
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
