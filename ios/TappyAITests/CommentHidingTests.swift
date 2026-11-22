import XCTest
@testable import TappyAI

/// The post owner hides a comment under their own post (web `POST /api/comments/{id}/hide`, migration 20261208; `hidden_at` / `hidden_by`
/// on `GET /api/reviews/{id}/comments`). The rules mirror web `feedShared.tsx`.
final class CommentHidingTests: XCTestCase {

    private func comment(by author: String = "writer", hiddenAt: String? = nil, hiddenBy: String? = nil) -> ReviewComment {
        ReviewComment(id: "c1", body: "b", createdAt: "2026-11-01T00:00:00Z", userId: author, profiles: nil,
                      hiddenAt: hiddenAt, hiddenBy: hiddenBy)
    }

    func testTheCommentListDecodesTheHiddenFields() throws {
        let json = #"{"comments":[{"id":"c1","body":"x","created_at":"2026-11-01T00:00:00Z","user_id":"u1","hidden_at":"2026-11-02T00:00:00Z","hidden_by":"owner"},{"id":"c2","body":"y","created_at":"2026-11-01T00:00:00Z","user_id":"u2"}],"count":2}"#
        let r = try ResponseDecoder.json.decode(CommentsResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.comments[0].hiddenAt, "2026-11-02T00:00:00Z")
        XCTAssertEqual(r.comments[0].hiddenBy, "owner")
        XCTAssertTrue(r.comments[0].isHidden)
        XCTAssertFalse(r.comments[1].isHidden, "an older server, or a visible comment, carries no hidden fields")
    }

    func testOnlyThePostOwnerMayHideSomeoneElsesComment() {
        let c = comment()
        XCTAssertTrue(CommentActions.canHide(c, isPostOwner: true, currentUserId: "owner"))
        XCTAssertFalse(CommentActions.canHide(c, isPostOwner: false, currentUserId: "owner"), "not the post's owner")
        XCTAssertFalse(CommentActions.canHide(c, isPostOwner: true, currentUserId: nil), "signed out")
        XCTAssertFalse(CommentActions.canHide(comment(by: "owner"), isPostOwner: true, currentUserId: "owner"), "the owner's own comment is deleted, not hidden")
    }

    func testACommentHeldByReportsOrAModeratorCannotBeShownAgainByTheOwner() {
        XCTAssertTrue(CommentActions.canHide(comment(hiddenAt: "t", hiddenBy: "owner"), isPostOwner: true, currentUserId: "owner"), "the owner may take their own hide back")
        XCTAssertFalse(CommentActions.canHide(comment(hiddenAt: "t", hiddenBy: "auto"), isPostOwner: true, currentUserId: "owner"))
        XCTAssertFalse(CommentActions.canHide(comment(hiddenAt: "t", hiddenBy: "moderator"), isPostOwner: true, currentUserId: "owner"))
    }

    func testSettingHiddenIsTheOwnersHideAndItsUndo() {
        let hidden = CommentActions.settingHidden(true, on: comment())
        XCTAssertTrue(hidden.isHidden)
        XCTAssertEqual(hidden.hiddenBy, "owner")
        let shown = CommentActions.settingHidden(false, on: hidden)
        XCTAssertFalse(shown.isHidden)
        XCTAssertNil(shown.hiddenBy)
    }

    func testTheNoteSaysWhoHidTheCommentAndFromWhom() {
        XCTAssertNil(ReviewCommentSheet.hiddenNoteKey(comment(), isPostOwner: true))
        XCTAssertEqual(ReviewCommentSheet.hiddenNoteKey(comment(hiddenAt: "t", hiddenBy: "owner"), isPostOwner: true), "review.comments.hiddenOwner")
        XCTAssertEqual(ReviewCommentSheet.hiddenNoteKey(comment(hiddenAt: "t", hiddenBy: "owner"), isPostOwner: false), "review.comments.hiddenForYou")
        XCTAssertEqual(ReviewCommentSheet.hiddenNoteKey(comment(hiddenAt: "t", hiddenBy: "auto"), isPostOwner: false), "review.comments.hiddenReview")
    }

    func testTheEyeButtonNeedsAServerThatHasTheHideRoute() {
        let c = comment()
        XCTAssertTrue(ReviewCommentSheet.showsHideButton(c, isPostOwner: true, currentUserId: "owner", flags: SafetyFlags(commentModeration: true)))
        XCTAssertFalse(ReviewCommentSheet.showsHideButton(c, isPostOwner: true, currentUserId: "owner", flags: .off),
                       "an older server has no /hide route: a button there could only fail")
        XCTAssertFalse(ReviewCommentSheet.showsHideButton(c, isPostOwner: false, currentUserId: "owner", flags: SafetyFlags(commentModeration: true)))
    }

    func testEveryStringTheHideButtonShowsHasACatalogEntry() {
        for key in ["review.comments.hide", "review.comments.unhide", "review.comments.hiddenOwner",
                    "review.comments.hiddenForYou", "review.comments.hiddenReview"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
