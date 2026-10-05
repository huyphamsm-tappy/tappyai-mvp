import XCTest
@testable import TappyAI

/// In-app account deletion (`POST /api/account/delete`, rc/web-uat) and its email fallback.
final class AccountDeletionTests: XCTestCase {

    func testRowUsesInAppDeletionOnlyWhenTheServerFlagIsOn() {
        XCTAssertTrue(AccountDeletion.usesInAppDeletion(flag: true))
        XCTAssertFalse(AccountDeletion.usesInAppDeletion(flag: false))
        XCTAssertFalse(AccountDeletion.usesInAppDeletion(flag: nil), "absent (production /api/config) → email request")
    }

    func testConfigDecodesTheFlagAndToleratesItsAbsence() throws {
        func flags(_ json: String) throws -> AppConfig.Flags {
            try ResponseDecoder.json.decode(AppConfig.Flags.self, from: Data(json.utf8))
        }
        XCTAssertEqual(try flags(#"{"showProUpgrade":false,"accountSelfDelete":true}"#).accountSelfDelete, true)
        XCTAssertNil(try flags(#"{"showProUpgrade":false}"#).accountSelfDelete)
    }

    func testConfirmWordMatchesTheServerNormalisation() {
        for ok in ["XÓA", "xóa", "  XÓA ", "XOÁ", "DELETE", "delete", "Delete\n",
                   "XO\u{0301}A"] {   // decomposed Ó (O + combining acute) — NFC makes it XÓA
            XCTAssertTrue(AccountDeletion.isConfirmWord(ok), ok)
        }
        for bad in ["", "XOA", "DEL", "DELETE ME", "xoá tài khoản"] {
            XCTAssertFalse(AccountDeletion.isConfirmWord(bad), bad)
        }
    }

    func testDeleteIsAnAuthenticatedPostWithTheTypedWord() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true}"#.utf8)
        try await AccountDeletionService(api: api).requestSelfDeletion(confirm: "XÓA")
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/account/delete")
        XCTAssertEqual(sent.method, .post)
        XCTAssertTrue(sent.requiresAuth)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(sent.body)) as? [String: String])
        XCTAssertEqual(body, ["confirm": "XÓA"])
    }

    func testOutcomesFollowTheRouteContract() {
        XCTAssertEqual(AccountDeletionOutcome.from(.success(())), .deleted)
        let cases: [(AppError, AccountDeletionOutcome)] = [
            (.network(status: 409, code: "staff_account"), .staffAccount),
            (.network(status: 404, code: "not_available"), .notAvailable),   // flag off → email request
            (.network(status: 404, code: nil), .notAvailable),               // route not deployed
            (.authentication(reason: .unauthenticated), .signInAgain),       // 401
            (.authentication(reason: .forbidden), .signInAgain),             // 403 account_required
            (.validation(message: "confirm_required"), .failed),
            (.network(status: 500, code: "delete_failed"), .failed),
            (.offline, .failed),
        ]
        for (error, expected) in cases {
            XCTAssertEqual(AccountDeletionOutcome.from(.failure(error)), expected, "\(error)")
        }
        XCTAssertNil(AccountDeletionOutcome.deleted.errorKey)
        XCTAssertNil(AccountDeletionOutcome.notAvailable.errorKey)
    }

    func testEveryDeletionStringIsInTheCatalog() {
        var keys = ["settings.deleteAccountSelf", "account.delete.title", "account.delete.warning",
                    "account.delete.removes.heading", "account.delete.kept.heading", "account.delete.kept.lead",
                    "account.delete.confirm.label", "account.delete.confirm.word", "account.delete.submit",
                    "account.delete.deleting", "account.delete.cancel", "account.delete.finalConfirm.title",
                    "account.delete.done.title", "account.delete.done.p1", "account.delete.done.p2",
                    "account.delete.done.home", "account.delete.warning.title", "account.delete.warning.confirm",
                    "account.delete.plan.known", "account.delete.plan.generic"]
        keys += (1...9).map { "account.delete.removes.\($0)" } + (1...2).map { "account.delete.kept.\($0)" }
        keys += [AccountDeletionOutcome.staffAccount, .signInAgain, .failed, .appleAuthorizationRequired, .appleAuthorizationInvalid,
                 .appleIdentityMismatch, .appleUnavailable, .appleRevokeFailed].compactMap(\.errorKey)
        for key in keys {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }

    // MARK: - Sign in with Apple (App Review 5.1.1(v)) — the web contract: apple_authorization_code, revoke before delete

    func testAppleCodeIsSentOnlyWhenPresent() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true}"#.utf8)
        let service = AccountDeletionService(api: api)
        try await service.requestSelfDeletion(confirm: "DELETE", appleAuthorizationCode: "code-1")
        try await service.requestSelfDeletion(confirm: "DELETE", appleAuthorizationCode: "")
        try await service.requestSelfDeletion(confirm: "DELETE", appleAuthorizationCode: nil)
        func body(_ i: Int) throws -> [String: String] {
            try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(api.sentEndpoints[i].body)) as? [String: String])
        }
        XCTAssertEqual(try body(0), ["confirm": "DELETE", "apple_authorization_code": "code-1"])
        XCTAssertEqual(try body(1), ["confirm": "DELETE"], "an empty code is never sent")
        XCTAssertEqual(try body(2), ["confirm": "DELETE"])
        for endpoint in api.sentEndpoints {
            XCTAssertEqual(endpoint.path, "/api/account/delete")
            XCTAssertTrue(endpoint.requiresAuth, "deletion stays authenticated")
        }
    }

    func testAppleOutcomesFollowTheRouteContract() {
        let cases: [(AppError, AccountDeletionOutcome)] = [
            (.network(status: 409, code: "apple_authorization_required"), .appleAuthorizationRequired),
            (.network(status: 409, code: "apple_identity_mismatch"), .appleIdentityMismatch),
            (.network(status: 409, code: "staff_account"), .staffAccount),   // another 409 is NOT an Apple error
            (.network(status: 409, code: nil), .staffAccount),
            (.network(status: 502, code: "apple_revoke_failed"), .appleRevokeFailed),
            (.network(status: 503, code: "apple_revoke_unavailable"), .appleUnavailable),
            (.network(status: 502, code: nil), .failed),
            (.network(status: 503, code: "something_else"), .failed),
        ]
        for (error, expected) in cases {
            XCTAssertEqual(AccountDeletionOutcome.from(.failure(error)), expected, "\(error)")
        }
        // The client maps 400 to .validation without its code: «400 after sending a code» is the invalid code.
        XCTAssertEqual(AccountDeletionOutcome.from(.failure(AppError.validation(message: "x")), appleCodeSent: true), .appleAuthorizationInvalid)
        XCTAssertEqual(AccountDeletionOutcome.from(.failure(AppError.validation(message: "x")), appleCodeSent: false), .failed)
        // None of the Apple errors pretends the account was deleted, and each has a sentence.
        for outcome in [AccountDeletionOutcome.appleAuthorizationRequired, .appleAuthorizationInvalid, .appleIdentityMismatch, .appleUnavailable, .appleRevokeFailed] {
            XCTAssertNotEqual(outcome, .deleted)
            XCTAssertNotNil(outcome.errorKey)
        }
    }

    /// Records what the flow sent and how often the Apple sheet was asked for.
    private final class FlowProbe {
        var sent: [(word: String, code: String?)] = []
        var reauthorizations = 0
    }

    private func flow(_ probe: FlowProbe, responses: [Error?], reauthorize: @escaping () async throws -> String?) -> AccountDeletionFlow {
        var remaining = responses
        return AccountDeletionFlow(
            send: { word, code in
                probe.sent.append((word, code))
                if let next = remaining.isEmpty ? nil : remaining.removeFirst(), let error = next { throw error }
            },
            reauthorize: {
                probe.reauthorizations += 1
                return try await reauthorize()
            }
        )
    }

    func testANonAppleAccountIsDeletedInOneRequestWithoutTheAppleSheet() async {
        let probe = FlowProbe()
        let outcome = await flow(probe, responses: [nil], reauthorize: { "never" }).run(confirm: "DELETE")
        XCTAssertEqual(outcome, .deleted)
        XCTAssertEqual(probe.sent.count, 1)
        XCTAssertNil(probe.sent[0].code, "the first request never carries a code")
        XCTAssertEqual(probe.reauthorizations, 0)
    }

    func testAnAppleAccountReconfirmsWithAppleThenSendsTheSameRequestWithTheFreshCode() async {
        let probe = FlowProbe()
        let required = AppError.network(status: 409, code: "apple_authorization_required")
        let outcome = await flow(probe, responses: [required, nil], reauthorize: { "fresh-code" }).run(confirm: "DELETE")
        XCTAssertEqual(outcome, .deleted)
        XCTAssertEqual(probe.sent.count, 2)
        XCTAssertNil(probe.sent[0].code)
        XCTAssertEqual(probe.sent[1].code, "fresh-code")
        XCTAssertEqual(probe.sent[1].word, probe.sent[0].word, "the same confirmation, not a new one")
        XCTAssertEqual(probe.reauthorizations, 1)
    }

    func testCancellingTheAppleSheetLeavesTheAccountAndSendsNothingMore() async {
        let probe = FlowProbe()
        let required = AppError.network(status: 409, code: "apple_authorization_required")
        let cancelled = await flow(probe, responses: [required], reauthorize: { nil }).run(confirm: "DELETE")
        XCTAssertEqual(cancelled, .appleAuthorizationRequired)
        XCTAssertEqual(probe.sent.count, 1, "no second request after a cancel")

        let failedProbe = FlowProbe()
        struct SheetBroke: Error {}
        let broke = await flow(failedProbe, responses: [required], reauthorize: { throw SheetBroke() }).run(confirm: "DELETE")
        XCTAssertEqual(broke, .failed)
        XCTAssertEqual(failedProbe.sent.count, 1)

        let emptyProbe = FlowProbe()
        let empty = await flow(emptyProbe, responses: [required], reauthorize: { "" }).run(confirm: "DELETE")
        XCTAssertEqual(empty, .appleAuthorizationRequired, "an empty code is treated as cancelled")
        XCTAssertEqual(emptyProbe.sent.count, 1)
    }

    func testTheSecondRequestsFailuresMapToTheApplePathAndAreNeverRetriedWithTheSameCode() async {
        let required = AppError.network(status: 409, code: "apple_authorization_required")
        let cases: [(AppError, AccountDeletionOutcome)] = [
            (.validation(message: "expired"), .appleAuthorizationInvalid),
            (.network(status: 409, code: "apple_identity_mismatch"), .appleIdentityMismatch),
            (.network(status: 502, code: "apple_revoke_failed"), .appleRevokeFailed),
            (.network(status: 503, code: "apple_revoke_unavailable"), .appleUnavailable),
            (.network(status: 500, code: "delete_failed"), .failed),
            (.authentication(reason: .unauthenticated), .signInAgain),
        ]
        for (error, expected) in cases {
            let probe = FlowProbe()
            let outcome = await flow(probe, responses: [required, error], reauthorize: { "fresh-code" }).run(confirm: "DELETE")
            XCTAssertEqual(outcome, expected, "\(error)")
            XCTAssertEqual(probe.sent.count, 2, "exactly one retry; a single-use code is never sent twice (\(error))")
            XCTAssertEqual(probe.reauthorizations, 1)
        }
    }

    func testOtherFirstRequestFailuresNeverOpenTheAppleSheet() async {
        let cases: [(AppError, AccountDeletionOutcome)] = [
            (.network(status: 409, code: "staff_account"), .staffAccount),
            (.network(status: 404, code: "not_available"), .notAvailable),
            (.authentication(reason: .unauthenticated), .signInAgain),
            (.network(status: 500, code: "delete_failed"), .failed),
            (.offline, .failed),
        ]
        for (error, expected) in cases {
            let probe = FlowProbe()
            let outcome = await flow(probe, responses: [error], reauthorize: { "fresh-code" }).run(confirm: "DELETE")
            XCTAssertEqual(outcome, expected, "\(error)")
            XCTAssertEqual(probe.reauthorizations, 0, "\(error)")
            XCTAssertEqual(probe.sent.count, 1)
        }
    }
}
