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
    /// The three real places the AI chose among (empty when none yet — the plain `suggestion` text
    /// is then the whole answer, as before).
    let suggestionOptions: [GroupCard]
    /// The id of the place the group settled on, once decided.
    let chosenOption: String?
    /// Who has voted and how (nil from a server without the vote migration).
    let votes: GroupVotes?
    /// The bill of the meal, computed by the server (nil: none yet, or a server without the bill migration).
    let bill: GroupBill?
    /// The people of the meal by opaque key (the leader is `leader`, others their member-row id) —
    /// never account ids. The bill form needs them before any bill exists.
    let people: [GroupPerson]
    /// Which of `people` is the caller.
    let myKey: String?

    init(id: String, name: String?, creatorId: String?, status: String?, suggestion: String?,
         createdAt: String?, members: [GroupMember]?, state: String? = nil,
         pendingRequests: [GroupMember]? = nil, avatarUrl: String? = nil,
         suggestionOptions: [GroupCard] = [], chosenOption: String? = nil, votes: GroupVotes? = nil,
         bill: GroupBill? = nil, people: [GroupPerson] = [], myKey: String? = nil) {
        self.bill = bill
        self.people = people
        self.myKey = myKey
        self.suggestionOptions = suggestionOptions
        self.chosenOption = chosenOption
        self.votes = votes
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
                  pendingRequests: pendingRequests, avatarUrl: avatarUrl,
                  suggestionOptions: suggestionOptions, chosenOption: chosenOption, votes: votes,
                  bill: bill, people: people, myKey: myKey)
    }

    /// A fresh suggestion replaces the cards and clears the vote and the decision (what the web does).
    func withNewSuggestion(_ text: String, cards: [GroupCard]) -> GroupRoom {
        GroupRoom(id: id, name: name, creatorId: creatorId, status: status, suggestion: text,
                  createdAt: createdAt, members: members, state: state,
                  pendingRequests: pendingRequests, avatarUrl: avatarUrl,
                  suggestionOptions: cards, chosenOption: nil, votes: nil,
                  bill: bill, people: people, myKey: myKey)
    }

    /// The card the group chose, if it is one of the cards.
    var chosenCard: GroupCard? { suggestionOptions.first { $0.id == chosenOption } }

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

/// One suggested place. Every fact on it was read from a real place row by the server.
struct GroupCard: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String
    let address: String?
    let rating: Double?
    /// One sentence on why it suits this group.
    let why: String?
    let mapsLink: String?
    let photoUrl: String?

    enum CodingKeys: String, CodingKey { case id, name, address, rating, why, mapsLink, photoUrl }

    init(id: String, name: String, address: String? = nil, rating: Double? = nil, why: String? = nil,
         mapsLink: String? = nil, photoUrl: String? = nil) {
        self.id = id; self.name = name; self.address = address; self.rating = rating
        self.why = why; self.mapsLink = mapsLink; self.photoUrl = photoUrl
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        // A card with no name is not a place: the row is dropped by `lossyArray`.
        guard let n = c.lenient(String.self, forKey: .name), !n.isEmpty else {
            throw DecodingError.keyNotFound(CodingKeys.name, .init(codingPath: c.codingPath, debugDescription: "no name"))
        }
        name = n
        address = c.lenient(String.self, forKey: .address)
        rating = c.lenientDouble(forKey: .rating).flatMap { $0.isFinite ? $0 : nil }
        why = c.lenient(String.self, forKey: .why)
        mapsLink = c.lenient(String.self, forKey: .mapsLink)
        photoUrl = c.lenient(String.self, forKey: .photoUrl)
    }
}

/// The state of a group's vote. One vote per person, changeable until the decision; a place with
/// MORE THAN HALF of the participants' votes is chosen by the server in the same step.
struct GroupVotes: Decodable, Sendable, Hashable {
    let counts: [String: Int]
    let voted: Int
    let participants: Int
    let majority: String?
    let allVoted: Bool
    /// The card this person voted for.
    let mine: String?

    enum CodingKeys: String, CodingKey { case counts, voted, participants, majority, allVoted, mine }

    init(counts: [String: Int] = [:], voted: Int = 0, participants: Int = 0, majority: String? = nil,
         allVoted: Bool = false, mine: String? = nil) {
        self.counts = counts; self.voted = voted; self.participants = participants
        self.majority = majority; self.allVoted = allVoted; self.mine = mine
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        counts = c.lenient([String: Int].self, forKey: .counts, default: [:])
        voted = min(max(c.lenientInt(forKey: .voted) ?? 0, 0), 1000)
        participants = min(max(c.lenientInt(forKey: .participants) ?? 0, 0), 1000)
        majority = c.lenient(String.self, forKey: .majority)
        allVoted = c.lenient(Bool.self, forKey: .allVoted, default: false)
        mine = c.lenient(String.self, forKey: .mine)
    }

    /// Nobody has more than half and everyone has voted: only the leader's choice can settle it.
    var isTie: Bool { allVoted && majority == nil }
}

/// A person of the meal by opaque key.
struct GroupPerson: Decodable, Sendable, Hashable, Identifiable {
    let key: String
    let name: String
    var id: String { key }

    enum CodingKeys: String, CodingKey { case key, name }

    init(key: String, name: String) { self.key = key; self.name = name }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.requiredId(forKey: .key)
        name = c.lenient(String.self, forKey: .name) ?? ""
    }
}

/// The bill of a group meal as the participants see it. The SERVER computes the split (`settlement`);
/// the app shows it and never recalculates, so the two can never disagree about who owes what.
struct GroupBill: Decodable, Sendable, Hashable {
    struct Item: Decodable, Sendable, Hashable {
        let name: String
        let amountVnd: Int
        let forId: String

        enum CodingKeys: String, CodingKey { case name, amountVnd, forId }

        init(name: String, amountVnd: Int, forId: String) {
            self.name = name; self.amountVnd = amountVnd; self.forId = forId
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            name = c.lenient(String.self, forKey: .name) ?? ""
            amountVnd = c.lenientInt(forKey: .amountVnd) ?? 0
            forId = try c.requiredId(forKey: .forId)
        }
    }

    struct Share: Decodable, Sendable, Hashable {
        let id: String
        let name: String
        let personalVnd: Int
        let dueVnd: Int

        enum CodingKeys: String, CodingKey { case id, name, personalVnd, dueVnd }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.requiredId(forKey: .id)
            name = c.lenient(String.self, forKey: .name) ?? ""
            personalVnd = c.lenientInt(forKey: .personalVnd) ?? 0
            dueVnd = c.lenientInt(forKey: .dueVnd) ?? 0
        }
    }

    struct Settlement: Decodable, Sendable, Hashable {
        let sharedVnd: Int
        let shares: [Share]

        enum CodingKeys: String, CodingKey { case sharedVnd, shares }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            sharedVnd = c.lenientInt(forKey: .sharedVnd) ?? 0
            shares = c.lossyArray(Share.self, forKey: .shares)
        }
    }

    let payerKey: String?
    let payerName: String?
    let totalVnd: Int
    let tipVnd: Int
    let items: [Item]
    let excluded: [String]
    /// Person key -> has paid the payer back.
    let paid: [String: Bool]
    let isPayer: Bool
    /// nil when the payer has left the group: the bill must be entered again.
    let settlement: Settlement?

    enum CodingKeys: String, CodingKey { case payerKey, payerName, totalVnd, tipVnd, items, excluded, paid, isPayer, settlement }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        payerKey = c.lenient(String.self, forKey: .payerKey)
        payerName = c.lenient(String.self, forKey: .payerName)
        totalVnd = c.lenientInt(forKey: .totalVnd) ?? 0
        tipVnd = c.lenientInt(forKey: .tipVnd) ?? 0
        items = c.lossyArray(Item.self, forKey: .items)
        excluded = c.lenient([String].self, forKey: .excluded) ?? []
        paid = c.lenient([String: Bool].self, forKey: .paid) ?? [:]
        isPayer = c.lenient(Bool.self, forKey: .isPayer) ?? false
        settlement = c.lenient(Settlement.self, forKey: .settlement)
    }
}

/// `PUT/PATCH /api/group/{id}/bill` — the stored bill after the change.
struct GroupBillResponse: Decodable, Sendable {
    let ok: Bool?
    let bill: GroupBill?
}

/// `POST /api/group/{id}/vote` and `.../choose` — the decision, if one was reached.
struct GroupVoteResponse: Decodable, Sendable {
    let ok: Bool?
    let chosen: String?
}

/// `POST /api/group/{id}/suggest`. `options` are the cards; the text stays for a group whose
/// places could not be searched.
struct GroupSuggestionResponse: Decodable, Sendable {
    let suggestion: String
    let options: [GroupCard]

    enum CodingKeys: String, CodingKey { case suggestion, options }

    init(suggestion: String, options: [GroupCard] = []) {
        self.suggestion = suggestion
        self.options = options
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        suggestion = try c.decode(String.self, forKey: .suggestion)
        options = c.lossyArray(GroupCard.self, forKey: .options)
    }
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
    enum CodingKeys: String, CodingKey { case id, name, creatorId, status, suggestion, createdAt, members, state, pendingRequests, avatarUrl, suggestionOptions, chosenOption, votes, bill, people, myKey }

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
        suggestionOptions = c.lossyArray(GroupCard.self, forKey: .suggestionOptions)
        chosenOption = c.lenient(String.self, forKey: .chosenOption)
        votes = c.lenient(GroupVotes.self, forKey: .votes)
        bill = c.lenient(GroupBill.self, forKey: .bill)
        people = c.lossyArray(GroupPerson.self, forKey: .people)
        myKey = c.lenient(String.self, forKey: .myKey)
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
