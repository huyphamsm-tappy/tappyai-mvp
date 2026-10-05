import XCTest
@testable import TappyAI

/// Comment replies and reactions, as the Web API carries them (`GET /api/reviews/{id}/comments`: `parent_comment_id`, `reactions`,
/// `my_reaction`; `POST …/comments {parentId}`; `POST|DELETE /api/comments/{id}/reactions`).
final class CommentActionsTests: XCTestCase {

    private func comment(_ id: String, parent: String? = nil, reactions: [String: Int] = [:], mine: String? = nil) -> ReviewComment {
        ReviewComment(id: id, body: "b\(id)", createdAt: "2026-10-01T00:00:00Z", userId: "u", profiles: nil,
                      parentCommentId: parent, reactions: reactions, myReaction: mine)
    }

    func testTheCommentListDecodesRepliesAndReactions() throws {
        let json = #"{"comments":[{"id":"c1","body":"hi","created_at":"2026-10-01T00:00:00Z","user_id":"u1","parent_comment_id":null,"reactions":{"like":2,"love":1},"my_reaction":"like"},{"id":"c2","body":"re","created_at":"2026-10-01T00:01:00Z","user_id":"u2","parent_comment_id":"c1","reactions":{},"my_reaction":null}],"count":2}"#
        let r = try ResponseDecoder.json.decode(CommentsResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.comments[0].reactions, ["like": 2, "love": 1])
        XCTAssertEqual(r.comments[0].myReaction, "like")
        XCTAssertEqual(r.comments[1].parentCommentId, "c1")
        XCTAssertNil(r.comments[1].myReaction)
    }

    func testAnOlderResponseWithoutTheNewFieldsStillDecodes() throws {
        let json = #"{"comments":[{"id":"c1","body":"hi","created_at":"2026-10-01T00:00:00Z","user_id":"u1"}],"count":1}"#
        let r = try ResponseDecoder.json.decode(CommentsResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.comments[0].reactions, [:])
        XCTAssertNil(r.comments[0].parentCommentId)
    }

    func testPickingAReactionAddsItAndPickingItAgainTakesItBack() {
        let c = comment("c1")
        let liked = CommentActions.applying(.like, to: c)
        XCTAssertEqual(liked.reactions, ["like": 1])
        XCTAssertEqual(liked.myReaction, "like")
        XCTAssertEqual(CommentActions.resulting(.like, on: c), .like)
        let removed = CommentActions.applying(.like, to: liked)
        XCTAssertEqual(removed.reactions, [:])
        XCTAssertNil(removed.myReaction)
        XCTAssertNil(CommentActions.resulting(.like, on: liked), "the server is asked to DELETE")
    }

    func testChangingTheReactionMovesTheCount() {
        let c = comment("c1", reactions: ["like": 2], mine: "like")
        let loved = CommentActions.applying(.love, to: c)
        XCTAssertEqual(loved.reactions, ["like": 1, "love": 1])
        XCTAssertEqual(loved.myReaction, "love")
    }

    func testRepliesFollowTheirParentOneLevelDeep() {
        let list = [comment("a"), comment("b"), comment("a1", parent: "a"), comment("b1", parent: "b"), comment("a2", parent: "a")]
        let out = CommentActions.threaded(list)
        XCTAssertEqual(out.map(\.comment.id), ["a", "a1", "a2", "b", "b1"])
        XCTAssertEqual(out.map(\.isReply), [false, true, true, false, true])
    }

    func testAReplyWhoseParentIsGoneIsStillShown() {
        let out = CommentActions.threaded([comment("x", parent: "deleted"), comment("y")])
        XCTAssertEqual(out.map(\.comment.id), ["x", "y"])
    }

    func testTheReactionKeysAreTheOnesTheServerAccepts() {
        XCTAssertEqual(Set(CommentReaction.allCases.map(\.rawValue)), ["like", "love", "haha", "wow", "sad", "angry"])
    }

    // MARK: - The rest of the Web contract (feedShared.tsx / ReviewCommentButton.tsx)

    func testReplyingToAReplyAttachesToTheTopLevelThread() {
        let top = comment("a")
        let reply = comment("a1", parent: "a")
        XCTAssertEqual(CommentActions.parentId(forReplyingTo: top), "a")
        XCTAssertEqual(CommentActions.parentId(forReplyingTo: reply), "a", "never nested deeper than one level")
    }

    func testDeletingAParentTakesItsRepliesWithIt() {
        let list = [comment("a"), comment("a1", parent: "a"), comment("b"), comment("b1", parent: "b")]
        XCTAssertEqual(CommentActions.removing("a", from: list).map(\.id), ["b", "b1"])
        XCTAssertEqual(CommentActions.removing("a1", from: list).map(\.id), ["a", "b", "b1"], "a reply alone leaves its parent")
    }

    func testTheReactionSummaryIsUpToThreeEmojiAndTheTotal() {
        XCTAssertNil(CommentActions.reactionSummary(comment("c")))
        XCTAssertEqual(CommentActions.reactionSummary(comment("c", reactions: ["like": 2, "love": 1])), "👍❤️ 3")
        XCTAssertEqual(CommentActions.reactionSummary(comment("c", reactions: ["like": 1, "love": 1, "haha": 1, "wow": 1])), "👍❤️😂 4")
    }

    func testTheReplyNameIsTheLastWordOfTheName() throws {
        let named = try ResponseDecoder.json.decode(ReviewComment.self, from: Data(#"{"id":"c","body":"b","created_at":"x","user_id":"u","profiles":{"full_name":"Nguyễn Văn An"}}"#.utf8))
        XCTAssertEqual(CommentActions.shortName(named, anonymous: "Ẩn danh"), "An")
        XCTAssertEqual(CommentActions.shortName(comment("c"), anonymous: "Ẩn danh"), "Ẩn danh")
    }
}
