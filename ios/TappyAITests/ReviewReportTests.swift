import XCTest
@testable import TappyAI

/// Reporting someone else's review (`POST /api/reviews/[id]/report`, rc/web-uat).
final class ReviewReportTests: XCTestCase {

    func testReasonsAreTheServerWhitelistInWebOrder() {
        XCTAssertEqual(ReviewReportReason.allCases.map(\.rawValue),
                       ["spam", "harassment", "inappropriate", "copyright", "misinformation", "violence", "other"])
    }

    func testEveryReasonAndMessageHasACatalogString() {
        let keys = ReviewReportReason.allCases.map(\.labelKey)
            + ["review.report.title", ReviewReportOutcome.sent.messageKey, ReviewReportOutcome.failed.messageKey]
        for key in keys {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }

    func testReportIsAnAuthenticatedPostWithOnlyTheReason() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true,"reported":true}"#.utf8)
        let response = try await ReviewsService(api: api).reportReview(reviewId: "r-42", reason: .copyright)

        XCTAssertEqual(response.reported, true)
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/reviews/r-42/report")
        XCTAssertEqual(sent.method, .post)
        XCTAssertTrue(sent.requiresAuth)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(sent.body)) as? [String: String])
        XCTAssertEqual(body, ["reason": "copyright"], "no free text: the route has no details field")
    }

    func testOutcomes() throws {
        let duplicate = try JSONDecoder().decode(ReviewReportResponse.self,
                                                 from: Data(#"{"ok":true,"reported":true,"alreadyReported":true}"#.utf8))
        XCTAssertEqual(duplicate.alreadyReported, true)
        XCTAssertEqual(ReviewReportOutcome.from(.success(duplicate)), .sent, "a repeat report is still 'sent', as on web")
        for error in [AppError.network(status: 404, code: nil),                    // route not deployed (production)
                      AppError.authentication(reason: .forbidden),                 // 403 account_required (anonymous)
                      AppError.validation(message: "invalid_reason"),
                      AppError.offline] {
            XCTAssertEqual(ReviewReportOutcome.from(.failure(error)), .failed, "\(error)")
        }
    }
}
