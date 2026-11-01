import XCTest
@testable import TappyAI

/// Reading the account's plan for the composer menu (`GET /api/payments/me`, web `subscriptionState.ts`). Any failure — 404 while
/// the plans are not on sale, no network, a body that does not decode — is "not known", which keeps the whole menu.
final class PlanAccessReadTests: XCTestCase {

    private struct Failure: Error {}

    private func service(_ api: ChatTestAPI) -> ChatService {
        ChatService(api: api, streaming: ScriptedChatStreaming(lines: []))
    }

    func testAPaidActivePlanDecodes() async {
        let json = """
        {"signedIn":true,"subscription":{"state":"ACTIVE","plan":{"id":"coco","name":"Coco"},"periodEnd":"2026-12-01T00:00:00Z","channel":"web"},"pipUsed":true,"quota":{"limit":300,"used":3,"remaining":297,"period":"day"}}
        """
        let api = ChatTestAPI { _ in Data(json.utf8) }
        let access = await service(api).getPlanAccess()
        XCTAssertEqual(access, PlanAccess(signedIn: true, state: "ACTIVE", planId: "coco"))
    }

    func testAVisitorDecodesWithoutAPlan() async {
        let json = """
        {"signedIn":false,"subscription":{"state":"NONE","plan":null,"periodEnd":null,"channel":null},"pipUsed":false,"quota":{"limit":10,"used":0,"remaining":10,"period":"lifetime"}}
        """
        let api = ChatTestAPI { _ in Data(json.utf8) }
        let access = await service(api).getPlanAccess()
        XCTAssertEqual(access, PlanAccess(signedIn: false, state: "NONE", planId: nil))
    }

    func testTheRequestIsAnAuthenticatedGetOfPaymentsMe() async {
        let api = ChatTestAPI { _ in Data("{}".utf8) }
        _ = await service(api).getPlanAccess()
        let sent = api.sentEndpoints
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent.first?.path, "/api/payments/me")
        XCTAssertEqual(sent.first?.method, .get)
        XCTAssertEqual(sent.first?.requiresAuth, true)
    }

    func testAnErrorAnswerIsUnknown() async {
        let api = ChatTestAPI { _ in throw AppError.unexpected(message: "404") }
        let access = await service(api).getPlanAccess()
        XCTAssertNil(access)
    }

    func testALostConnectionIsUnknown() async {
        let api = ChatTestAPI { _ in throw Failure() }
        let access = await service(api).getPlanAccess()
        XCTAssertNil(access)
    }

    func testABodyThatDoesNotDecodeIsUnknown() async {
        for body in ["not json", "{}", "{\"signedIn\":true}", "{\"signedIn\":\"yes\",\"subscription\":{\"state\":\"ACTIVE\"}}"] {
            let api = ChatTestAPI { _ in Data(body.utf8) }
            let access = await service(api).getPlanAccess()
            XCTAssertNil(access, body)
        }
    }
}
