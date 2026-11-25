import Foundation

/// One person who likes a post (`GET /api/reviews/{id}/likes`). A liker with no profile row is real
/// (an anonymous session never got one) and is kept, with no name: the list must agree with the count.
struct ReviewLiker: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let fullName: String?
    let avatarUrl: String?

    enum CodingKeys: String, CodingKey { case id, fullName, avatarUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        fullName = c.lenient(String.self, forKey: .fullName)
        avatarUrl = c.lenient(String.self, forKey: .avatarUrl)
    }

    var displayName: String {
        let trimmed = fullName?.trimmingCharacters(in: .whitespaces) ?? ""
        return trimmed.isEmpty ? NSLocalizedString("search.user.unnamed", comment: "") : trimmed
    }
}

struct LikersPage: Decodable, Sendable {
    let likers: [ReviewLiker]
    /// Present only when a full page may have more behind it.
    let nextCursor: String?

    enum CodingKeys: String, CodingKey { case likers, nextCursor }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        likers = c.lossyArray(ReviewLiker.self, forKey: .likers)
        nextCursor = c.lenient(String.self, forKey: .nextCursor)
    }
}
