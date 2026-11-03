import XCTest
@testable import TappyAI

/// Locks the comment replies + reactions contract
/// (`supabase/migrations/20260720_comment_replies_reactions.sql`, Production Knowledge Base §4).
/// The model keeps the parent id and the per-key counts; a reply is a comment with a parent, and
/// the total is the sum of the counts.
final class ReviewCommentReactionTests: XCTestCase {
    private func total(_ comment: ReviewComment) -> Int { comment.reactions.values.reduce(0, +) }

    func testDecodesTopLevelCommentWithReactions() throws {
        let json = """
        {"id":"c1","body":"Ngon quá","createdAt":"2026-08-06T00:00:00.000Z","userId":"u1",
         "profiles":{"fullName":"Huy","avatarUrl":null},"parentCommentId":null,
         "reactions":{"❤️":3},"myReaction":"❤️"}
        """
        let comment = try ResponseDecoder.json.decode(ReviewComment.self, from: Data(json.utf8))
        XCTAssertNil(comment.parentCommentId, "a top-level comment has no parent")
        XCTAssertEqual(total(comment), 3)
        XCTAssertEqual(comment.myReaction, "❤️")
    }

    /// A reply carries `parentCommentId` — one level of nesting only.
    func testDecodesReply() throws {
        let json = """
        {"id":"c2","body":"Đồng ý!","createdAt":"2026-08-06T00:01:00.000Z","userId":"u2",
         "profiles":null,"parentCommentId":"c1","reactions":null,"myReaction":null}
        """
        let comment = try ResponseDecoder.json.decode(ReviewComment.self, from: Data(json.utf8))
        XCTAssertEqual(comment.parentCommentId, "c1")
        XCTAssertEqual(total(comment), 0)
    }

    /// Free-form reaction strings — no fixed enum server-side; decoding must not assume "❤️" is
    /// the only possible key.
    func testReactionsAreFreeFormNotAFixedEnum() throws {
        let json = """
        {"id":"c3","body":"B","createdAt":"2026-08-06T00:00:00.000Z","userId":"u1","profiles":null,
         "parentCommentId":null,"reactions":{"👍":2,"😂":1},"myReaction":"👍"}
        """
        let comment = try ResponseDecoder.json.decode(ReviewComment.self, from: Data(json.utf8))
        XCTAssertEqual(total(comment), 3)
    }
}
