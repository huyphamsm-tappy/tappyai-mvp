import SwiftUI

/// The Messages tab of the Inbox — the web's `MessagesProvider` + `MessagesTab`. The conversation list with its server-derived unread counts and a
/// filter over what is LOADED (there is no message search index, so it narrows by name and last message, never pretends to search history).
/// The list is re-read on appear, on a slow timer and on pull-to-refresh — "re-read the list rather than patch it", because unread is derived
/// server-side.
@MainActor
final class MessagesListViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    @AppPublished private(set) var state: LoadState = .idle
    @AppPublished private(set) var threads: [ChatThreadSummary] = []
    @AppPublished var query = ""

    let meId: String?
    private let service: MessagingService
    private let log = AppLogger.app

    init(meId: String?, service: MessagingService) {
        self.meId = meId
        self.service = service
    }

    /// Sum of per-thread unread. Message unread ONLY — never the notification count.
    var unreadTotal: Int { threads.reduce(0) { $0 + $1.unreadCount } }

    /// The list under the filter: by title (counterpart / group name) or last message body.
    func visible(fallbackUser: String, fallbackGroup: String) -> [ChatThreadSummary] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return threads }
        return threads.filter { t in
            let title = t.displayTitle(meId: meId, fallback: t.kind == .group ? fallbackGroup : fallbackUser).lowercased()
            return title.contains(q) || (t.lastMessage?.body.lowercased().contains(q) ?? false)
        }
    }

    func load() async {
        if threads.isEmpty { state = .loading }
        do {
            threads = try await service.threads()
            state = .loaded
        } catch {
            // Keep the previous list on a transient failure, as the web does.
            state = threads.isEmpty ? (Task.isCancelled ? .idle : .failed) : .loaded
            log.error("threads load failed: \(error)")
        }
    }
}

/// The new-conversation flow — the web `NewMessageSheet`: search REAL accounts (the existing `/api/users/search`), pick one or more, start.
/// One person is a direct thread (deduplicated server-side), more is a group. No directory listing and no suggested people.
@MainActor
final class NewMessageViewModel: AppObservableObject {
    static let minQuery = 2

    @AppPublished var peopleQuery = "" { didSet { scheduleSearch() } }
    @AppPublished private(set) var people: [UserSearchResult] = []
    @AppPublished private(set) var searching = false
    @AppPublished private(set) var selected: [UserSearchResult] = []
    @AppPublished var groupName = "" { didSet { if groupName.count > 120 { groupName = String(groupName.prefix(120)) } } }
    @AppPublished private(set) var starting = false
    @AppPublished private(set) var startFailed = false

    private let search: ReviewsService
    private let service: MessagingService
    private let meId: String?
    private var searchTask: Task<Void, Never>?

    init(search: ReviewsService, service: MessagingService, meId: String?) {
        self.search = search
        self.service = service
        self.meId = meId
    }

    func toggle(_ user: UserSearchResult) {
        if let i = selected.firstIndex(where: { $0.id == user.id }) { selected.remove(at: i) } else { selected.append(user) }
    }

    func isSelected(_ user: UserSearchResult) -> Bool { selected.contains { $0.id == user.id } }

    private func scheduleSearch() {
        searchTask?.cancel()
        let q = peopleQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= Self.minQuery else { people = []; searching = false; return }
        searching = true
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let self else { return }
            let found = (try? await self.search.searchUsers(query: q)) ?? []
            guard !Task.isCancelled else { return }
            self.people = found.filter { $0.id != self.meId }
            self.searching = false
        }
    }

    /// One person → direct; more → a group. The thread id, or nil when it could not be started (ONE sentence on purpose: "blocked",
    /// "not allowed to reach you" and "no such account" are indistinguishable — the web does the same).
    func start() async -> String? {
        guard !selected.isEmpty, !starting else { return nil }
        starting = true
        startFailed = false
        defer { starting = false }
        do {
            return try await service.start(userIds: selected.map(\.id), title: selected.count > 1 ? groupName : nil)
        } catch {
            startFailed = true
            return nil
        }
    }
}
