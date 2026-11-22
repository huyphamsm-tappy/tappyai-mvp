import SwiftUI
import XCTest
@testable import TappyAI

/// 03/11 (iOS audit batch 3): the pieces of the fixes that need no UI.
@MainActor
final class SignOutAndLinkFixesTests: XCTestCase {

    func testABarePathWithAQueryKeepsOnlyTheId() {
        let handler = DeepLinkHandler()
        XCTAssertEqual(handler.target(for: "/reviews/abc?utm_source=x"), .review(id: "abc"))
        XCTAssertEqual(handler.target(for: "/users/u1#top"), .userProfile(id: "u1"))
    }

    func testSigningOutClearsEveryStackAndSheet() {
        let router = AppRouter()
        router.push(ReviewsDestination.userProfile(id: "u1"), on: .profile)
        router.push(ReviewsDestination.reviewDetail(id: "r1"), on: .explore)
        router.chatSeed = "hello"
        router.resetAfterSignOut()
        for tab in AppTab.allCases { XCTAssertTrue(router.paths[tab]?.isEmpty ?? true, "\(tab) stack is empty") }
        XCTAssertNil(router.chatSeed)
        XCTAssertNil(router.presentedSheet)
    }
}
