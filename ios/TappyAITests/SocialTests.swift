import XCTest
@testable import TappyAI

/// Following / Followers (`GET /api/social/connections`, rc/web-uat only) and the follow toggle.
final class SocialTests: XCTestCase {

    private func person(_ id: String, following: Bool, followers: Int = 1) -> UserSearchResult {
        UserSearchResult(id: id, fullName: "P \(id)", avatarUrl: nil, followerCount: followers,
                         followingCount: 0, isFollowing: following)
    }

    func testConnectionsIsAnAuthenticatedGetWithTheType() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"users":[{"id":"u1","full_name":"An","avatar_url":null,"follower_count":3,"following_count":1,"is_following":false}]}"#.utf8)
        let users = try await SocialService(api: api).connections(.followers)

        XCTAssertEqual(users.map(\.id), ["u1"])
        XCTAssertEqual(users.first?.followerCount, 3)
        XCTAssertEqual(users.first?.isFollowing, false)
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/social/connections")
        XCTAssertEqual(sent.method, .get)
        XCTAssertTrue(sent.requiresAuth)
        XCTAssertEqual(sent.query, [URLQueryItem(name: "type", value: "followers")])
    }

    func testLoadOutcomes() {
        let one = [person("a", following: true)]
        XCTAssertEqual(SocialLoadOutcome.from(.success(one)), .loaded(one))
        XCTAssertEqual(SocialLoadOutcome.from(.failure(AppError.network(status: 404, code: nil))), .unavailable,
                       "production has no route: say 'not available yet', not an error")
        XCTAssertEqual(SocialLoadOutcome.from(.failure(AppError.authentication(reason: .unauthenticated))), .signIn)
        XCTAssertEqual(SocialLoadOutcome.from(.failure(AppError.network(status: 500, code: nil))), .failed)
        XCTAssertEqual(SocialLoadOutcome.from(.failure(AppError.offline)), .failed)
    }

    func testFollowChangePatchesFollowersAndDropsFollowing() {
        var lists = SocialLists(following: [person("a", following: true)],
                                followers: [person("a", following: false, followers: 4), person("b", following: false)])
        lists.applyFollowChange(id: "a", isFollowing: true, followerCount: 5)

        XCTAssertNil(lists.following, "membership changed: reload from the server")
        XCTAssertEqual(lists.followers?.first?.isFollowing, true)
        XCTAssertEqual(lists.followers?.first?.followerCount, 5, "the server's recalculated count")
        XCTAssertEqual(lists.followers?.last?.isFollowing, false, "other people untouched")
    }

    func testSubscriptReadsAndWritesEachDirection() {
        var lists = SocialLists()
        lists[.followers] = [person("x", following: false)]
        XCTAssertNil(lists[.following])
        XCTAssertEqual(lists[.followers]?.map(\.id), ["x"])
    }

    func testEveryStringHasACatalogEntry() {
        let keys = SocialConnectionType.allCases.flatMap { [$0.tabKey, $0.emptyKey] } + [
            "social.title", "social.follow", "social.following", "social.followsYou", "social.viewProfile",
            "social.signIn", "social.error", "social.findPeople", "social.unavailable", "social.followError",
            "profile.row.social", "profile.row.social.desc",
        ]
        for key in keys {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
