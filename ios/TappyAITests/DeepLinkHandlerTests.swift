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

    func testNestedPathMatchesTabPrefix() {
        XCTAssertEqual(handler.target(for: "/reviews/123"), .tab(.explore))
    }

    func testCustomSchemeURL() {
        XCTAssertEqual(handler.target(for: "tappyai:///chat"), .tab(.chat))
    }

    func testUnknownPathReturnsNil() {
        XCTAssertNil(handler.target(for: "/unknown-section"))
    }
}
