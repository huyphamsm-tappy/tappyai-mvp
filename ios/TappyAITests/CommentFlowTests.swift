import XCTest
@testable import TappyAI

/// Comments over a stubbed API (no network): reply (`parentId`), reaction set / change / remove (POST / DELETE), delete: at the service
/// and at both view models (`ReviewDetailViewModel`, `ReviewsFeedViewModel`). There is no hide-comment action: the Web has none.
private final class RoutingAPI: APIClient, @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [Endpoint] = []
    var requests: [Endpoint] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }
    var handler: (Endpoint) throws -> Data

    init(_ handler: @escaping (Endpoint) throws -> Data) { self.handler = handler }

    func send(_ endpoint: Endpoint) async throws -> Data {
        lock.lock()
        recorded.append(endpoint)
        lock.unlock()
        return try handler(endpoint)
    }

    func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T {
        let data = try await send(endpoint)
        return try ResponseDecoder.json.decode(T.self, from: data)
    }

    func body(of endpoint: Endpoint) -> [String: String]? {
        guard let data = endpoint.body else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
    }
}

@MainActor
final class CommentFlowTests: XCTestCase {

    private static let commentsJSON = #"{"comments":[{"id":"c1","body":"hi","created_at":"2026-10-01T00:00:00Z","user_id":"u1","parent_comment_id":null,"reactions":{},"my_reaction":null},{"id":"c2","body":"re","created_at":"2026-10-01T00:01:00Z","user_id":"u2","parent_comment_id":"c1","reactions":{},"my_reaction":null}],"count":2}"#
    private static let postedJSON = #"{"comment":{"id":"c3","body":"answer","created_at":"2026-10-01T00:02:00Z","user_id":"me","parent_comment_id":"c1"},"count":3}"#

    private struct Boom: Error {}

    private func route(failReactions: Bool = false) -> RoutingAPI {
        RoutingAPI { e in
            if e.path.contains("/reactions") {
                if failReactions { throw Boom() }
                return Data(#"{"ok":true}"#.utf8)
            }
            if e.path.hasSuffix("/comments") {
                switch e.method {
                case .get: return Data(Self.commentsJSON.utf8)
                case .post: return Data(Self.postedJSON.utf8)
                case .delete: return Data(#"{"ok":true,"count":1}"#.utf8)
                default: break
                }
            }
            return Data("{}".utf8)
        }
    }

    private func session() -> SessionStore { SessionStore(storage: InMemoryTokenStorage()) }

    private func waitUntil(_ timeout: TimeInterval = 3, _ condition: () -> Bool) async -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while !condition(), Date() < end { try? await Task.sleep(nanoseconds: 10_000_000) }
        return condition()
    }

    private func reactionRequests(_ api: RoutingAPI) -> [Endpoint] {
        api.requests.filter { $0.path.contains("/reactions") }
    }

    // MARK: service

    func testServicePostsAReplyWithParentId() async throws {
        let api = route()
        _ = try await ReviewsService(api: api).postComment(reviewId: "r1", body: "answer", parentId: "c1")
        let req = try XCTUnwrap(api.requests.last)
        XCTAssertEqual(req.method, .post)
        XCTAssertEqual(req.path, "/api/reviews/r1/comments")
        XCTAssertTrue(req.requiresAuth)
        XCTAssertEqual(api.body(of: req), ["body": "answer", "parentId": "c1"])
    }

    func testServiceTopLevelCommentCarriesNoParentId() async throws {
        let api = route()
        _ = try await ReviewsService(api: api).postComment(reviewId: "r1", body: "hello")
        XCTAssertEqual(api.body(of: try XCTUnwrap(api.requests.last)), ["body": "hello"])
        _ = try await ReviewsService(api: api).postComment(reviewId: "r1", body: "hello", parentId: "")
        XCTAssertEqual(api.body(of: try XCTUnwrap(api.requests.last)), ["body": "hello"], "an empty parent id is never sent")
    }

    func testServiceSetsAndChangesAReactionWithPostAndRemovesItWithDelete() async throws {
        let api = route()
        let service = ReviewsService(api: api)
        try await service.setCommentReaction(commentId: "c1", reaction: .like)
        try await service.setCommentReaction(commentId: "c1", reaction: .love)   // a change is another POST with the new key
        try await service.setCommentReaction(commentId: "c1", reaction: nil)
        let r = api.requests
        XCTAssertEqual(r.map(\.method), [.post, .post, .delete])
        XCTAssertEqual(Set(r.map(\.path)), ["/api/comments/c1/reactions"])
        XCTAssertEqual(api.body(of: r[0]), ["reaction": "like"])
        XCTAssertEqual(api.body(of: r[1]), ["reaction": "love"])
        XCTAssertNil(r[2].body)
        XCTAssertTrue(r.allSatisfy { $0.requiresAuth })
    }

    func testServiceDeletesACommentById() async throws {
        let api = route()
        let response = try await ReviewsService(api: api).deleteComment(reviewId: "r1", commentId: "c2")
        let req = try XCTUnwrap(api.requests.last)
        XCTAssertEqual(req.method, .delete)
        XCTAssertEqual(req.path, "/api/reviews/r1/comments")
        XCTAssertEqual(req.query.first { $0.name == "commentId" }?.value, "c2")
        XCTAssertEqual(response.count, 1)
    }

    // MARK: ReviewDetailViewModel

    private func detailVM(_ api: RoutingAPI) -> ReviewDetailViewModel {
        ReviewDetailViewModel(reviewId: "r1", service: ReviewsService(api: api), session: session())
    }

    func testDetailReplyToAReplyAttachesToTheTopLevelParent() async throws {
        let api = route()
        let vm = detailVM(api)
        await vm.loadComments()
        XCTAssertEqual(vm.comments.map(\.id), ["c1", "c2"])
        vm.replyingTo = vm.comments[1]            // c2 is itself a reply to c1
        vm.commentText = "answer"
        vm.postComment()
        let sent = await waitUntil { api.requests.contains { $0.method == .post } }
        XCTAssertTrue(sent)
        let post = try XCTUnwrap(api.requests.first { $0.method == .post })
        XCTAssertEqual(api.body(of: post)?["parentId"], "c1", "threads never nest deeper than one level")
        let done = await waitUntil { !vm.isPostingComment }
        XCTAssertTrue(done)
        XCTAssertEqual(vm.comments.last?.id, "c3")
        XCTAssertEqual(vm.commentCount, 3)
        XCTAssertNil(vm.replyingTo)
    }

    func testDetailReactionSetChangeRemove() async throws {
        let api = route()
        let vm = detailVM(api)
        await vm.loadComments()

        vm.react(to: vm.comments[0], with: .like)
        XCTAssertEqual(vm.comments[0].myReaction, "like", "shown at once")
        let first = await waitUntil { self.reactionRequests(api).count == 1 }
        XCTAssertTrue(first)

        vm.react(to: vm.comments[0], with: .love)
        XCTAssertEqual(vm.comments[0].myReaction, "love")
        XCTAssertEqual(vm.comments[0].reactions["like"] ?? 0, 0)
        let second = await waitUntil { self.reactionRequests(api).count == 2 }
        XCTAssertTrue(second)

        vm.react(to: vm.comments[0], with: .love)   // the same one again takes it back
        XCTAssertNil(vm.comments[0].myReaction)
        let third = await waitUntil { self.reactionRequests(api).count == 3 }
        XCTAssertTrue(third)

        let reactions = reactionRequests(api)
        XCTAssertEqual(reactions.map(\.method), [.post, .post, .delete])
        XCTAssertEqual(api.body(of: reactions[0]), ["reaction": "like"])
        XCTAssertEqual(api.body(of: reactions[1]), ["reaction": "love"])
    }

    func testDetailReactionIsUndoneWhenTheServerRefuses() async throws {
        let api = route(failReactions: true)
        let vm = detailVM(api)
        await vm.loadComments()
        vm.react(to: vm.comments[0], with: .like)
        XCTAssertEqual(vm.comments[0].myReaction, "like")
        let undone = await waitUntil { vm.comments[0].myReaction == nil }
        XCTAssertTrue(undone)
        XCTAssertEqual(vm.comments[0].reactions, [:])
    }

    func testDetailDeleteRemovesTheCommentAndItsRepliesAndTakesTheServerCount() async throws {
        let api = route()
        let vm = detailVM(api)
        await vm.loadComments()
        vm.deleteComment(commentId: "c1")
        let gone = await waitUntil { vm.comments.isEmpty }
        XCTAssertTrue(gone)
        XCTAssertEqual(vm.commentCount, 1)
        let del = try XCTUnwrap(api.requests.first { $0.method == .delete })
        XCTAssertEqual(del.query.first { $0.name == "commentId" }?.value, "c1")
    }

    // MARK: ReviewsFeedViewModel

    private func feedVM(_ api: RoutingAPI) -> ReviewsFeedViewModel {
        ReviewsFeedViewModel(service: ReviewsService(api: api), session: session())
    }

    func testFeedReplyReactionAndDelete() async throws {
        let api = route()
        let vm = feedVM(api)
        vm.openComments(reviewId: "r1")
        let loaded = await waitUntil { vm.comments.count == 2 }
        XCTAssertTrue(loaded)

        vm.replyingTo = vm.comments[0]
        vm.commentText = "answer"
        vm.postComment()
        let posted = await waitUntil { api.requests.contains { $0.method == .post } }
        XCTAssertTrue(posted)
        let post = try XCTUnwrap(api.requests.first { $0.method == .post })
        XCTAssertEqual(api.body(of: post), ["body": "answer", "parentId": "c1"])
        let idle = await waitUntil { !vm.isPostingComment }
        XCTAssertTrue(idle)

        vm.react(to: vm.comments[0], with: .haha)
        let first = await waitUntil { self.reactionRequests(api).count == 1 }
        XCTAssertTrue(first)
        vm.react(to: vm.comments[0], with: .haha)
        let reacted = await waitUntil { self.reactionRequests(api).count == 2 }
        XCTAssertTrue(reacted)
        XCTAssertEqual(reactionRequests(api).map(\.method), [.post, .delete])

        vm.deleteComment(commentId: "c1")
        let removed = await waitUntil { !vm.comments.contains { $0.id == "c1" || $0.parentCommentId == "c1" } }
        XCTAssertTrue(removed)
        XCTAssertEqual(vm.commentCount, 1)
    }
}
