import Foundation

/// One person's answers in a group-dining room.
///
/// Every field except `name` is optional on the server and is stored as a free-text string, not an
/// enum — the AI suggestion reads them as prose ("ngân sách 200k, thích lẩu"), so constraining
/// them to a fixed set here would narrow what a person can say without making the suggestion any
/// better.
struct GroupMember: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String?
    let budget: String?
    let foodPreferences: String?
    let dietaryRestrictions: String?
    let area: String?
    let createdAt: String?

    var displayName: String {
        let trimmed = name?.trimmingCharacters(in: .whitespaces) ?? ""
        return trimmed.isEmpty ? NSLocalizedString("search.user.unnamed", comment: "") : trimmed
    }
}

/// `GET /api/group?id=` — a room and everyone in it.
struct GroupRoom: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String?
    let creatorId: String?
    let status: String?
    /// The AI's restaurant suggestion, once the creator has asked for one. Persisted server-side,
    /// so everyone in the room sees the same answer rather than each generating their own.
    let suggestion: String?
    let createdAt: String?
    let members: [GroupMember]?
}

/// `POST /api/group` — the room that was just created.
struct CreatedGroup: Decodable, Sendable {
    let id: String
    let name: String?
}

/// `POST /api/group/{id}/join`.
struct JoinGroupResponse: Decodable, Sendable {
    let ok: Bool?
    /// The server treats a duplicate join as success and says so. Joining twice is not an error —
    /// it is what happens when someone reopens a link they already used.
    let alreadyJoined: Bool?
}

/// `POST /api/group/{id}/suggest`.
struct GroupSuggestionResponse: Decodable, Sendable {
    let suggestion: String
}

/// What one person answers when joining. `name` and `area` are required by the server; the rest
/// are optional and are sent as empty strings when left blank, which is what the web form does.
struct GroupJoinForm: Sendable, Equatable {
    var name: String = ""
    var budget: String = ""
    var foodPreferences: String = ""
    var dietaryRestrictions: String = ""
    var area: String = ""

    var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !area.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// The server's hard cap on a room, mirrored so the UI can say "full" without a round trip that
/// can only come back rejected. The server remains the authority — see `GroupDetailViewModel`.
enum GroupLimits {
    static let maxMembers = 10
}
