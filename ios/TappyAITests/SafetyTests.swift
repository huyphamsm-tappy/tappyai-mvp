import XCTest
@testable import TappyAI

/// Report / block contract (App Store 1.2) against the server's Phase 8 routes
/// (`phase8-master`: `src/app/api/reports/route.ts`, `users/[id]/block/route.ts`, `users/blocks/route.ts`).
@MainActor
final class SafetyTests: XCTestCase {

    /// Answers by path, so the config call and the block calls can differ in one test.
    final class RoutingAPI: APIClient, @unchecked Sendable {
        var responses: [String: Data] = [:]
        var failure: Error?
        private(set) var sent: [Endpoint] = []

        func send(_ endpoint: Endpoint) async throws -> Data {
            sent.append(endpoint)
            if let failure { throw failure }
            return responses[endpoint.path] ?? Data("{}".utf8)
        }
        func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T {
            sent.append(endpoint)
            if let failure { throw failure }
            return try ResponseDecoder.json.decode(T.self, from: responses[endpoint.path] ?? Data("{}".utf8))
        }
    }

    private let configBody = #"""
    {"flags":{"showProUpgrade":false},"upload":{"maxPhotosPerReview":5,"maxVideoSizeMb":150,"maxVideoDurationSec":300},
     "p8":{"userBlocks":true,"reports":true,"commentModeration":false}}
    """#

    // MARK: Contract

    func testReasonsAreTheServerWhitelistInOrder() {
        XCTAssertEqual(ReportReason.allCases.map(\.rawValue),
                       ["spam", "harassment", "hate", "sexual", "violence", "self_harm", "scam", "misinformation", "impersonation", "other"])
        XCTAssertEqual(ReportTargetKind.allCases.map(\.rawValue), ["review", "comment", "user"])
    }

    func testEveryStringTheSheetShowsHasACatalogEntry() {
        var keys = ReportReason.allCases.map(\.labelKey) + ReportTargetKind.allCases.map(\.titleKey)
        keys += [ReportOutcome.sent, .unavailable, .signInRequired, .tooManyRequests, .failed].map(\.messageKey)
        keys += ["safety.intro", "safety.report.heading", "safety.report.submit", "safety.block.heading", "safety.block.explain",
                 "safety.block.confirm", "safety.block.confirmBody", "safety.blocked.title", "safety.blocked.emptyTitle"]
        for key in keys { XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key) }
    }

    func testReportBodyHasOnlyTheServersFields() throws {
        let body = try ReportRequest(kind: .comment, targetId: "c-1", reason: .selfHarm, details: nil).jsonBody()
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json, ["target_type": "comment", "target_id": "c-1", "reason": "self_harm"], "no details key when empty")
    }

    func testDetailsAreTrimmedAndCappedAtTheServersLimit() throws {
        let long = String(repeating: "a", count: 1500)
        let body = try ReportRequest(kind: .user, targetId: "u", reason: .other, details: "  " + long + "  ").jsonBody()
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["details"]?.count, 1000)
        let blank = try ReportRequest(kind: .user, targetId: "u", reason: .other, details: "   \n ").jsonBody()
        XCTAssertNil((try XCTUnwrap(JSONSerialization.jsonObject(with: blank) as? [String: String]))["details"])
    }

    func testOutcomes() {
        XCTAssertEqual(ReportOutcome.from(.success(())), .sent)
        XCTAssertEqual(ReportOutcome.from(.failure(AppError.network(status: 404, code: nil))), .unavailable, "server flag off")
        XCTAssertEqual(ReportOutcome.from(.failure(AppError.network(status: 429, code: nil))), .tooManyRequests)
        XCTAssertEqual(ReportOutcome.from(.failure(AppError.authentication(reason: .forbidden))), .signInRequired, "anonymous / restricted")
        XCTAssertEqual(ReportOutcome.from(.failure(AppError.offline)), .failed)
    }

    func testBlockListDecodesLeniently() throws {
        let json = #"{"blocks":[{"blocked_id":"u9","created_at":"2026-09-30T08:00:00.000Z"},{"nope":1},{"blocked_id":"u3"}]}"#
        let list = try ResponseDecoder.json.decode(BlocksResponse.self, from: Data(json.utf8)).blocks
        XCTAssertEqual(list.map(\.blockedId), ["u9", "u3"], "a malformed row is skipped, not the whole list")
    }

    func testFlagsAreOffUnlessTheServerSaysSo() throws {
        XCTAssertEqual(SafetyFlags(nil), .off)
        XCTAssertFalse(SafetyFlags.off.anyEnabled)
        let cfg = try ResponseDecoder.json.decode(AppConfig.self, from: Data(configBody.utf8))
        XCTAssertEqual(SafetyFlags(cfg.p8), SafetyFlags(reports: true, userBlocks: true, commentModeration: false))
        let older = try ResponseDecoder.json.decode(
            AppConfig.self, from: Data(#"{"flags":{"showProUpgrade":false},"upload":{"maxPhotosPerReview":5,"maxVideoSizeMb":150,"maxVideoDurationSec":300}}"#.utf8))
        XCTAssertNil(older.p8, "a server without the block")
        XCTAssertEqual(SafetyFlags(older.p8), .off)
    }

    // MARK: Service

    func testServiceCallsTheRightRoutes() async throws {
        let api = RoutingAPI()
        api.responses["/api/users/blocks"] = Data(#"{"blocks":[{"blocked_id":"u9"}]}"#.utf8)
        let service = SafetyService(api: api)
        try await service.report(ReportRequest(kind: .review, targetId: "r-1", reason: .spam, details: nil))
        try await service.block(userId: "u2")
        try await service.unblock(userId: "u2")
        let list = try await service.blocks()

        XCTAssertEqual(api.sent.map { "\($0.method.rawValue) \($0.path)" },
                       ["POST /api/reports", "POST /api/users/u2/block", "DELETE /api/users/u2/block", "GET /api/users/blocks"])
        XCTAssertTrue(api.sent.allSatisfy(\.requiresAuth))
        XCTAssertEqual(list.map(\.blockedId), ["u9"])
    }

    // MARK: Store

    private func makeStore(_ api: RoutingAPI, signedIn: Bool = true) -> SafetyStore {
        let session = SessionStore(storage: InMemoryTokenStorage(signedIn ? TestFixtures.tokens(expiresIn: 3600) : nil))
        session.bootstrap()
        return SafetyStore(service: SafetyService(api: api), config: AppConfigService(api: api), session: session)
    }

    func testRefreshReadsTheFlagsAndTheBlockList() async {
        let api = RoutingAPI()
        api.responses["/api/config"] = Data(configBody.utf8)
        api.responses["/api/users/blocks"] = Data(#"{"blocks":[{"blocked_id":"u9"}]}"#.utf8)
        let store = makeStore(api)
        await store.refresh()
        XCTAssertEqual(store.flags, SafetyFlags(reports: true, userBlocks: true))
        XCTAssertEqual(store.blockedIds, ["u9"])
        XCTAssertTrue(store.isBlocked("u9"))
        XCTAssertFalse(store.isBlocked("u1"))
        XCTAssertFalse(store.isBlocked(nil))
    }

    func testABlockListIsNotFetchedForAGuestOrWhileBlockingIsOff() async {
        let guest = RoutingAPI(); guest.responses["/api/config"] = Data(configBody.utf8)
        await makeStore(guest, signedIn: false).refresh()
        XCTAssertFalse(guest.sent.contains { $0.path == "/api/users/blocks" }, "guest")

        let off = RoutingAPI()
        off.responses["/api/config"] = Data(#"{"flags":{"showProUpgrade":false},"upload":{"maxPhotosPerReview":5,"maxVideoSizeMb":150,"maxVideoDurationSec":300}}"#.utf8)
        await makeStore(off).refresh()
        XCTAssertFalse(off.sent.contains { $0.path == "/api/users/blocks" }, "server flag off")
    }

    func testBlockingHidesTheirItemsAtOnceAndUnblockingBringsThemBack() async {
        let api = RoutingAPI()
        let store = makeStore(api)
        let comments = [("a", "u1"), ("b", "u9"), ("c", "u9"), ("d", "u3")]
        XCTAssertEqual(store.visible(comments) { $0.1 }.count, 4)
        let blocked = await store.block("u9")
        XCTAssertTrue(blocked)
        XCTAssertEqual(store.visible(comments) { $0.1 }.map(\.0), ["a", "d"])
        let unblocked = await store.unblock("u9")
        XCTAssertTrue(unblocked)
        XCTAssertEqual(store.visible(comments) { $0.1 }.count, 4)
    }

    func testAFailedBlockChangesNothing() async {
        let api = RoutingAPI(); api.failure = AppError.network(status: 500, code: nil)
        let store = makeStore(api)
        let ok = await store.block("u9")
        XCTAssertFalse(ok)
        XCTAssertTrue(store.blockedIds.isEmpty)
    }

    func testReportingUsesTheStoreAndMapsErrors() async {
        let api = RoutingAPI()
        let store = makeStore(api)
        let sent = await store.report(ReportRequest(kind: .user, targetId: "u2", reason: .scam, details: nil))
        XCTAssertEqual(sent, .sent)
        api.failure = AppError.network(status: 404, code: nil)
        let unavailable = await store.report(ReportRequest(kind: .user, targetId: "u2", reason: .scam, details: nil))
        XCTAssertEqual(unavailable, .unavailable)
    }
}
