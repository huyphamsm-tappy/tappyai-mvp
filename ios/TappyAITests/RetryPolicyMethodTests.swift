import XCTest
@testable import TappyAI

/// 03/11: a POST that got a 500/502/504 may already have been processed; retrying it duplicated posts and payments.
final class RetryPolicyMethodTests: XCTestCase {
    private let policy = RetryPolicy.default

    func testAPostIsNotRetriedOnAServerError() {
        for status in [408, 500, 502, 504] {
            XCTAssertFalse(policy.shouldRetry(status: status, attempt: 0, method: .post), "POST \(status)")
            XCTAssertFalse(policy.shouldRetry(status: status, attempt: 0, method: .patch), "PATCH \(status)")
        }
    }

    func testAPostIsRetriedWhenTheServerSaidItDidNotProcessIt() {
        XCTAssertTrue(policy.shouldRetry(status: 429, attempt: 0, method: .post))
        XCTAssertTrue(policy.shouldRetry(status: 503, attempt: 1, method: .post))
        XCTAssertFalse(policy.shouldRetry(status: 503, attempt: 2, method: .post), "the attempt cap still applies")
    }

    func testSafeMethodsKeepTheFullList() {
        for status in [408, 429, 500, 502, 503, 504] {
            XCTAssertTrue(policy.shouldRetry(status: status, attempt: 0, method: .get))
            XCTAssertTrue(policy.shouldRetry(status: status, attempt: 0, method: .delete))
            XCTAssertTrue(policy.shouldRetry(status: status, attempt: 0, method: .put))
        }
        XCTAssertFalse(policy.shouldRetry(status: 400, attempt: 0, method: .get))
    }
}
