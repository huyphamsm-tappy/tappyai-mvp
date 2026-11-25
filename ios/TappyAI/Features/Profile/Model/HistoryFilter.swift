import Foundation

/// Which conversations the history list shows (web chat workspace: all / pinned / archived).
enum HistorySegment: String, CaseIterable, Identifiable, Sendable {
    case all, pinned, archived
    var id: String { rawValue }
}

enum HistoryFilter {
    /// `all` hides what was archived and puts pinned ones first; `pinned` is the pinned ones that
    /// are not archived; `archived` is the archived ones. A title search narrows any of them. The
    /// server's order (newest first) is kept inside each group.
    static func visible(_ items: [ChatHistoryItem], segment: HistorySegment, query: String) -> [ChatHistoryItem] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let matched = needle.isEmpty ? items : items.filter {
            $0.title.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
        switch segment {
        case .all:
            let live = matched.filter { !$0.isArchived }
            return live.filter(\.isPinned) + live.filter { !$0.isPinned }
        case .pinned:
            return matched.filter { $0.isPinned && !$0.isArchived }
        case .archived:
            return matched.filter(\.isArchived)
        }
    }

    /// The cursor for the next, older page: the `updated_at` of the last row held. Nil when the last
    /// page was short (nothing older) or the cursor is empty.
    static func nextCursor(lastPage: [ChatHistoryItem], all: [ChatHistoryItem], pageSize: Int) -> String? {
        guard lastPage.count >= pageSize, let last = all.last, !last.updatedAt.isEmpty else { return nil }
        return last.updatedAt
    }
}
