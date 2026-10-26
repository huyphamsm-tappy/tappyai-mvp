import XCTest
@testable import TappyAI

/// `GET /api/subscription` says where a paid plan came from (`source`). Only an App Store subscription may show a
/// renewal date and Apple's «Manage» screen; a plan bought elsewhere is shown plainly (Guideline 3.1.3(b)).
final class SubscriptionSourceTests: XCTestCase {

    private func decode(_ json: String) throws -> SubscriptionStatusResponse {
        try ResponseDecoder.json.decode(SubscriptionStatusResponse.self, from: Data(json.utf8))
    }

    private let quota = #""freeDailyLimit":30,"todayMessageCount":1,"remaining":29"#

    func testAppleSourceIsAnAppleSubscription() throws {
        let s = try decode(#"{"isPro":true,"source":"apple","# + quota + "}")
        XCTAssertTrue(s.isAppleSubscription)
    }

    func testExternalSourceIsNotAnAppleSubscription() throws {
        let s = try decode(#"{"isPro":true,"source":"external","# + quota + "}")
        XCTAssertTrue(s.isPro)
        XCTAssertFalse(s.isAppleSubscription)
    }

    func testMissingSourceIsNotTreatedAsApple() throws {
        let s = try decode(#"{"isPro":true,"# + quota + "}")
        XCTAssertNil(s.source)
        XCTAssertFalse(s.isAppleSubscription, "a server that predates the field must not make a plan look like an App Store one")
    }

    func testFreeAccountWithAppleSourceIsNotASubscription() throws {
        let s = try decode(#"{"isPro":false,"source":"apple","# + quota + "}")
        XCTAssertFalse(s.isAppleSubscription)
    }
}
