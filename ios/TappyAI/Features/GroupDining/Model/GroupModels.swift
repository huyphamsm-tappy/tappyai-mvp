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
    /// Who is asking, as the server sees it: `creator`, `member`, `pending` (asked to join, waiting
    /// for the leader) or `none` (only the group name is returned). Nil from an older server that
    /// does not send it — treated as the previous behaviour (a readable room).
    let state: String?
    /// Join requests waiting for the leader (only sent to the creator).
    let pendingRequests: [GroupMember]?
    /// The group's own picture, already filtered to a servable URL by the server.
    let avatarUrl: String?

    init(id: String, name: String?, creatorId: String?, status: String?, suggestion: String?,
         createdAt: String?, members: [GroupMember]?, state: String? = nil,
         pendingRequests: [GroupMember]? = nil, avatarUrl: String? = nil) {
        self.id = id
        self.name = name
        self.creatorId = creatorId
        self.status = status
        self.suggestion = suggestion
        self.createdAt = createdAt
        self.members = members
        self.state = state
        self.pendingRequests = pendingRequests
        self.avatarUrl = avatarUrl
    }

    /// The same room with a new suggestion text (everything else kept).
    func withSuggestion(_ text: String) -> GroupRoom {
        GroupRoom(id: id, name: name, creatorId: creatorId, status: status, suggestion: text,
                  createdAt: createdAt, members: members, state: state,
                  pendingRequests: pendingRequests, avatarUrl: avatarUrl)
    }

    /// True when the server says this person has asked to join and the leader has not answered.
    var isPendingForMe: Bool { state == "pending" }
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
    /// The newer server holds a join until the leader accepts it.
    let pending: Bool?
}

/// `{ ok: true }` — the answer of the members, leave and delete calls. Only success matters.
struct GroupOkResponse: Decodable, Sendable {
    let ok: Bool?
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

/// Lenient (LenientDecoding.swift): a member that does not decode is dropped, not the room.
extension GroupRoom {
    enum CodingKeys: String, CodingKey { case id, name, creatorId, status, suggestion, createdAt, members, state, pendingRequests, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        name = c.lenient(String.self, forKey: .name)
        creatorId = c.lenient(String.self, forKey: .creatorId)
        status = c.lenient(String.self, forKey: .status)
        suggestion = c.lenient(String.self, forKey: .suggestion)
        createdAt = c.lenient(String.self, forKey: .createdAt)
        members = c.lossyArray(GroupMember.self, forKey: .members)
        state = c.lenient(String.self, forKey: .state)
        pendingRequests = c.lossyArray(GroupMember.self, forKey: .pendingRequests)
        avatarUrl = c.lenient(String.self, forKey: .avatarUrl)
    }
}

extension GroupMember {
    enum CodingKeys: String, CodingKey { case id, name, budget, foodPreferences, dietaryRestrictions, area, createdAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        name = c.lenient(String.self, forKey: .name)
        // A budget typed as a number is still a budget.
        budget = c.lenient(String.self, forKey: .budget) ?? c.lenientInt(forKey: .budget).map(String.init)
        foodPreferences = c.lenient(String.self, forKey: .foodPreferences)
        dietaryRestrictions = c.lenient(String.self, forKey: .dietaryRestrictions)
        area = c.lenient(String.self, forKey: .area)
        createdAt = c.lenient(String.self, forKey: .createdAt)
    }
}
