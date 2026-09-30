import Foundation

/// The chat's `chatSessionId` (ANDROID-REQUESTS R14, contract fixed 29/09 — owner decision Q7).
/// A UUID v4 made once when a NEW chat opens and sent unchanged on EVERY turn of it — first turn
/// and guests included. A chat reopened from history reuses the id stored with it; an old chat that
/// never had one gets a fresh id (the server rebuilds its state from the messages).
/// Port of Android `ChatSessionId.kt`.
enum ChatSessionId {
    static func isValid(_ id: String?) -> Bool {
        guard let id else { return false }
        return id.range(of: #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#,
                        options: .regularExpression) != nil
    }

    /// `historyRowId` = the reopened chat's history row; `stored` = the id kept with that row on
    /// this device. The server pattern is lowercase, and `UUID().uuidString` is uppercase.
    static func resolve(historyRowId: String?,
                        store: ChatSessionIdStore = ChatSessionIdStore(),
                        newId: () -> String = { UUID().uuidString.lowercased() }) -> String {
        if let row = historyRowId, let stored = store.get(row), isValid(stored) { return stored }
        return newId()
    }
}

/// The id kept with each saved chat on this device (history row id → chatSessionId).
struct ChatSessionIdStore {
    private static let key = "chat_session_ids"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func get(_ historyRowId: String) -> String? {
        (defaults.dictionary(forKey: Self.key) as? [String: String])?[historyRowId]
    }

    func put(_ historyRowId: String, _ id: String) {
        var all = (defaults.dictionary(forKey: Self.key) as? [String: String]) ?? [:]
        all[historyRowId] = id
        defaults.set(all, forKey: Self.key)
    }
}
