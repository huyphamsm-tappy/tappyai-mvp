import XCTest
@testable import TappyAI

final class DeepLinkHandlerTests: XCTestCase {
    private let handler = DeepLinkHandler()

    func testRootMapsToHome() {
        XCTAssertEqual(handler.target(for: "/"), .tab(.home))
    }

    func testWebPathsMapToTabs() {
        XCTAssertEqual(handler.target(for: "/chat"), .tab(.chat))
        XCTAssertEqual(handler.target(for: "/reviews"), .tab(.explore))
        XCTAssertEqual(handler.target(for: "/deals"), .tab(.deals))
        XCTAssertEqual(handler.target(for: "/profile"), .tab(.profile))
    }

    // MARK: - Content links
    //
    // 🚨 `/reviews/123` used to resolve to `.tab(.explore)`, and this suite asserted that as
    // CORRECT behaviour. It is not: it is the bug. The longest-prefix match swallowed the id, so
    // every shared review link opened the feed instead of the review that was shared — and a test
    // written from the implementation rather than from the requirement kept it that way.

    func testReviewLinkKeepsItsID() {
        XCTAssertEqual(handler.target(for: "/reviews/123"), .review(id: "123"))
    }

    func testUserProfileLinkKeepsItsID() {
        XCTAssertEqual(handler.target(for: "/users/abc"), .userProfile(id: "abc"))
    }

    func testGroupLinkKeepsItsID() {
        // The link a group's entire mechanism depends on being sent to other people.
        XCTAssertEqual(handler.target(for: "/group/g1"), .group(id: "g1"))
    }

    func testGroupNewIsTheCreateScreenNotARoomCalledNew() {
        XCTAssertEqual(handler.target(for: "/group/new"), .groupCreate)
    }

    func testCopyrightPolicyLink() {
        XCTAssertEqual(handler.target(for: "/copyright"), .copyrightPolicy)
    }

    func testTabLinkStillWinsWhenThereIsNoID() {
        // The prefix match must still apply where there is nothing more specific to match.
        XCTAssertEqual(handler.target(for: "/reviews"), .tab(.explore))
        XCTAssertEqual(handler.target(for: "/reviews/"), .tab(.explore))
    }

    // MARK: - URL forms

    func testCustomSchemeURL() {
        XCTAssertEqual(handler.target(for: "tappyai:///chat"), .tab(.chat))
    }

    func testCustomSchemeWithHostAndPath() {
        // tappyai://reviews/123 → host "reviews", path "/123". Must resolve to the same target as
        // the https link it mirrors, or a push notification opens a different screen from the one
        // the same content opens from the web.
        XCTAssertEqual(handler.target(for: "tappyai://reviews/123"), .review(id: "123"))
    }

    func testUniversalLinkWithID() {
        XCTAssertEqual(
            handler.target(for: "https://www.tappyai.com/reviews/xyz"),
            .review(id: "xyz")
        )
    }

    func testUnknownPathReturnsNil() {
        XCTAssertNil(handler.target(for: "/unknown-section"))
    }
}
