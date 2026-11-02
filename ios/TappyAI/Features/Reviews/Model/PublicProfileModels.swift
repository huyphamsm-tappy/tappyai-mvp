import Foundation

/// `GET /api/users/{id}` — the public view of someone else's profile.
///
/// The counts are the PUBLIC ones and mean the same thing to every viewer: `reviewCount` is
/// computed server-side over published, unhidden posts only. An author's own held content is a
/// different question answered by a different surface (`MyPostsView`), deliberately — a number
/// that changed depending on who asked would tell the author that content exists which nobody
/// they share it with can reach.
///
/// `isFollowing` and `isSelf` are resolved server-side FOR THE CALLER, so the header renders the
/// right button on first paint rather than after a second round trip.
struct PublicUserProfile: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let fullName: String?
    let avatarUrl: String?
    var followerCount: Int?
    let followingCount: Int?
    let reviewCount: Int?
    var isFollowing: Bool?
    let isSelf: Bool?

    var displayName: String {
        let trimmed = fullName?.trimmingCharacters(in: .whitespaces) ?? ""
        return trimmed.isEmpty ? NSLocalizedString("search.user.unnamed", comment: "") : trimmed
    }
}

/// Lenient: only `id` is required; counts may arrive as numbers or strings.
extension PublicUserProfile {
    enum CodingKeys: String, CodingKey {
        case id, fullName, avatarUrl, followerCount, followingCount, reviewCount, isFollowing, isSelf
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        fullName = c.lenient(String.self, forKey: .fullName)
        avatarUrl = c.lenient(String.self, forKey: .avatarUrl)
        followerCount = c.lenientInt(forKey: .followerCount)
        followingCount = c.lenientInt(forKey: .followingCount)
        reviewCount = c.lenientInt(forKey: .reviewCount)
        isFollowing = c.lenient(Bool.self, forKey: .isFollowing)
        isSelf = c.lenient(Bool.self, forKey: .isSelf)
    }
}

extension UserSearchResult {
    enum CodingKeys: String, CodingKey { case id, fullName, avatarUrl, followerCount, followingCount, isFollowing }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        fullName = c.lenient(String.self, forKey: .fullName)
        avatarUrl = c.lenient(String.self, forKey: .avatarUrl)
        followerCount = c.lenientInt(forKey: .followerCount)
        followingCount = c.lenientInt(forKey: .followingCount)
        isFollowing = c.lenient(Bool.self, forKey: .isFollowing)
    }
}
