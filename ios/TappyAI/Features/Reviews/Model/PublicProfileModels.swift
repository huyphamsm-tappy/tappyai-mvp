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
