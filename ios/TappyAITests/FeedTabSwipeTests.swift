import XCTest
@testable import TappyAI

/// A horizontal swipe changes the Explore tab (owner UAT: «không vuốt ngang trái phải để chuyển tab»).
final class FeedTabSwipeTests: XCTestCase {
    func testSwipeLeftGoesToTheNextTabAndRightToThePrevious() {
        XCTAssertEqual(FeedTab.neighbour(of: .following, dx: -120, dy: 5), .forYou)
        XCTAssertEqual(FeedTab.neighbour(of: .forYou, dx: -120, dy: 5), .latest)
        XCTAssertEqual(FeedTab.neighbour(of: .latest, dx: 120, dy: 5), .forYou)
        XCTAssertEqual(FeedTab.neighbour(of: .forYou, dx: 120, dy: 5), .following)
    }

    func testThereIsNothingPastEitherEnd() {
        XCTAssertNil(FeedTab.neighbour(of: .latest, dx: -120, dy: 0))
        XCTAssertNil(FeedTab.neighbour(of: .following, dx: 120, dy: 0))
    }

    func testAVerticalOrShortStrokeDoesNotChangeTheTab() {
        XCTAssertNil(FeedTab.neighbour(of: .forYou, dx: -80, dy: 300), "a page swipe that drifts sideways")
        XCTAssertNil(FeedTab.neighbour(of: .forYou, dx: -80, dy: 60), "not clearly horizontal")
        XCTAssertNil(FeedTab.neighbour(of: .forYou, dx: -30, dy: 0), "too short")
    }
}
