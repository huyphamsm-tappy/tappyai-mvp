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
        keys += [AccountDeletionOutcome.staffAccount, .signInAgain, .failed].compactMap(\.errorKey)
        for key in keys {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
