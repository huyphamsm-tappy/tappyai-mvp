import Foundation

/// Which conversations the history list shows (web chat workspace: all / pinned / archived).
enum HistorySegment: String, CaseIterable, Identifiable, Sendable {
    case all, pinned, archived
    var id: String { rawValue }
}

/// The day groups of the web history sidebar (src/lib/chat/workspace/historyModel.ts): `pinned` first on
/// "all", then today / the 7 days before today / everything older (and anything with an unreadable date).
enum HistoryGroupKey: String, CaseIterable, Sendable {
    case pinned, today, sevenDays, older

    /// Localizable key of the group's heading (web `chatWs.group.*`).
    var titleKey: String { "history.group.\(rawValue)" }
}

struct HistoryGroup: Identifiable {
    let key: HistoryGroupKey
    let items: [ChatHistoryItem]
    var id: String { key.rawValue }
}

enum HistoryFilter {
    /// The calendar the web groups by: the Vietnam calendar day, whatever the phone's own zone is.
    static var vietnamCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? TimeZone(secondsFromGMT: 7 * 3600) ?? .current
        return calendar
    }

    /// Web `timeGroupOf`: today = same Vietnam calendar day (a date in the future reads as today), seven days =
    /// the 7 days before the start of today, everything else and an unreadable date = older.
    static func timeGroup(of updatedAt: String, now: Date) -> HistoryGroupKey {
        guard let date = ISO8601Timestamp.date(from: updatedAt) else { return .older }
        let calendar = vietnamCalendar
        let today = calendar.startOfDay(for: now)
        if date >= today { return .today }
        if let weekAgo = calendar.date(byAdding: .day, value: -7, to: today), date >= weekAgo { return .sevenDays }
        return .older
    }

    /// Web `buildGroups`: on `all` the pinned ones come first in their own group, then the rest by day;
    /// on the other tabs everything is grouped by day only. Newest first inside a group, empty groups dropped.
    static func groups(_ items: [ChatHistoryItem], segment: HistorySegment, now: Date) -> [HistoryGroup] {
        func stamp(_ item: ChatHistoryItem) -> TimeInterval {
            ISO8601Timestamp.date(from: item.updatedAt)?.timeIntervalSince1970 ?? 0
        }
        let newestFirst: (ChatHistoryItem, ChatHistoryItem) -> Bool = { stamp($0) > stamp($1) }
        let pinned = segment == .all ? items.filter(\.isPinned).sorted(by: newestFirst) : []
        let rest = segment == .all ? items.filter { !$0.isPinned } : items
        var buckets: [HistoryGroupKey: [ChatHistoryItem]] = [:]
        for item in rest { buckets[timeGroup(of: item.updatedAt, now: now), default: []].append(item) }
        var out: [HistoryGroup] = []
        if !pinned.isEmpty { out.append(HistoryGroup(key: .pinned, items: pinned)) }
        for key in [HistoryGroupKey.today, .sevenDays, .older] {
            if let list = buckets[key], !list.isEmpty { out.append(HistoryGroup(key: key, items: list.sorted(by: newestFirst))) }
        }
        return out
    }

    /// `all` hides what was archived and puts pinned ones first; `pinned` is the pinned ones that
    /// are not archived; `archived` is the archived ones. A title search narrows any of them. The
    /// server's order (newest first) is kept inside each group.
    static func visible(_ items: [ChatHistoryItem], segment: HistorySegment, query: String) -> [ChatHistoryItem] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let folded = fold(needle)
        let matched = needle.isEmpty ? items : items.filter { fold($0.title).contains(folded) }
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

    /// Lowercase and without accents. `đ` is a letter of its own, not a `d` with a mark, so the
    /// system's diacritic folding leaves it alone; Vietnamese people type "da nang" for "Đà Nẵng".
    static func fold(_ s: String) -> String {
        s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            .replacingOccurrences(of: "đ", with: "d")
            .replacingOccurrences(of: "Đ", with: "d")
    }

    /// The cursor for the next, older page: the `updated_at` of the last row held. Nil when the last
    /// page was short (nothing older) or the cursor is empty.
    static func nextCursor(lastPage: [ChatHistoryItem], all: [ChatHistoryItem], pageSize: Int) -> String? {
        guard lastPage.count >= pageSize, let last = all.last, !last.updatedAt.isEmpty else { return nil }
        return last.updatedAt
    }
}
