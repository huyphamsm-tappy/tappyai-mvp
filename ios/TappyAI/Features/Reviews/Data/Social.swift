import Foundation

/// The two directions of `user_follows` — `GET /api/social/connections?type=…` (rc/web-uat
/// `src/app/api/social/connections/route.ts`). Directional on purpose: there is no friendship
/// model, so the screen is "Following / Followers", never "Friends".
enum SocialConnectionType: String, CaseIterable, Identifiable, Sendable {
    case following, followers

    var id: String { rawValue }
    var tabKey: String { self == .following ? "social.tabFollowing" : "social.tabFollowers" }
    var emptyKey: String { self == .following ? "social.emptyFollowing" : "social.emptyFollowers" }
}

/// What a list load came to.
///
/// `unavailable` is the production case: the route is only on rc/web-uat, so on `main` it 404s.
/// The screen then says the lists are not available yet and keeps people search (which IS on
/// production) usable, instead of an error that retrying can never fix.
enum SocialLoadOutcome: Equatable {
    case loaded([UserSearchResult])
    case unavailable
    case signIn
    case failed

    static func from(_ result: Result<[UserSearchResult], Error>) -> SocialLoadOutcome {
        switch result {
        case .success(let users): return .loaded(users)
        case .failure(let error):
            switch error as? AppError {
            case .network(404, _)?: return .unavailable
            case .authentication(.unauthenticated)?, .authentication(.forbidden)?,
                 .authentication(.sessionExpired)?, .authentication(.refreshFailed)?:
                return .signIn
            default: return .failed
            }
        }
    }
}

/// The lists the Social screen holds, and the one rule for a follow toggle (web `SocialView`
/// `onFollowChange`): the SERVER's answer is patched into every list the person appears in, and
/// the Following list is dropped — its membership changed and only the server knows the order.
struct SocialLists: Equatable {
    var following: [UserSearchResult]?
    var followers: [UserSearchResult]?

    subscript(type: SocialConnectionType) -> [UserSearchResult]? {
        get { type == .following ? following : followers }
        set { if type == .following { following = newValue } else { followers = newValue } }
    }

    mutating func applyFollowChange(id: String, isFollowing: Bool, followerCount: Int) {
        followers = followers.map { Self.patch($0, id: id, isFollowing: isFollowing, followerCount: followerCount) }
        following = nil
    }

    static func patch(_ people: [UserSearchResult], id: String, isFollowing: Bool, followerCount: Int) -> [UserSearchResult] {
        people.map { person in
            guard person.id == id else { return person }
            return UserSearchResult(id: person.id, fullName: person.fullName, avatarUrl: person.avatarUrl,
                                    followerCount: followerCount, followingCount: person.followingCount,
                                    isFollowing: isFollowing)
        }
    }
}

struct SocialService: Sendable {
    let api: APIClient

    /// `GET /api/social/connections?type=following|followers` — the caller's own graph only
    /// (no user id in the route), newest connection first, at most 60.
    func connections(_ type: SocialConnectionType) async throws -> [UserSearchResult] {
        let endpoint = Endpoint(
            path: "/api/social/connections",
            method: .get,
            query: [URLQueryItem(name: "type", value: type.rawValue)],
            requiresAuth: true
        )
        return try await api.send(endpoint, as: UserSearchResponse.self).users
    }
}
