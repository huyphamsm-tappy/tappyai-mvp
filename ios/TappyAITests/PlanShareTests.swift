import XCTest
@testable import TappyAI

/// Sharing a plan from iOS = publishing it through `POST /api/plans/share` and delivering the
/// ONE canonical `/plan/<shareId>` the server answers with. The server owns the identity; this
/// client never mints, hashes or guesses one. Every target then carries that URL.
///
/// ⚠️ Not executed in this repository's CI (no macOS runner); written for Xcode.
final class PlanShareTests: XCTestCase {

    private let id = "lSSFn0yDMF6w"
    private let canonical = "https://www.tappyai.com/plan/lSSFn0yDMF6w"

    /// A real reply, the way it arrives after enrichment: the block carries `photo_url`.
    private let reply = """
    Đây là kế hoạch Quy Nhơn cho hai bạn.

    [TAPPY_PLAN]{"type":"trip","title":"Quy Nhơn 3 ngày 2 đêm","people":2,"budget_total":"5.000.000đ","share_text":"Biển xanh, ẩm thực ngon.","days":[{"label":"Ngày 1","items":[{"time":"09:00","emoji":"🏖️","category":"entertainment","name":"Bãi Kỳ Co","address":"Xã Nhơn Lý, Quy Nhơn","photo_url":"https://lh3.googleusercontent.com/p/A","place_id":"ChIJx"},{"time":"12:30","emoji":"🦐","category":"food","name":"Hải sản Nhơn Lý"}]}]}[/TAPPY_PLAN]
    """

    /// An API double that records the endpoint and answers with a body or an error.
    private final class ScriptedAPI: APIClient, @unchecked Sendable {
        var body: Data = Data()
        var error: AppError? = nil
        private(set) var sent: [Endpoint] = []
        func send(_ endpoint: Endpoint) async throws -> Data {
            sent.append(endpoint)
            if let error { throw error }
            return body
        }
        func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T {
            let data = try await send(endpoint)
            do { return try ResponseDecoder.json.decode(T.self, from: data) }
            catch { throw AppError.unexpected(message: "decode") }
        }
    }

    private func service(_ api: ScriptedAPI, authenticated: Bool = true) -> PlanShareService {
        PlanShareService(api: api, isAuthenticated: { authenticated })
    }

    private func ok(_ json: String) -> Data { Data(json.utf8) }

    // MARK: - The block that is published

    func testParserKeepsThePlanBlockVerbatimOnlyWhenThePlanDecoded() throws {
        let parsed = ContentParser.parse(reply)
        XCTAssertNotNil(parsed.plan)
        let block = try XCTUnwrap(parsed.planJSON)
        // Verbatim: the wire fields iOS's model does not carry (label/items/photo_url) survive.
        XCTAssertTrue(block.contains("\"photo_url\":\"https://lh3.googleusercontent.com/p/A\""))
        XCTAssertTrue(block.contains("\"label\":\"Ngày 1\""))
        XCTAssertTrue(block.hasPrefix("{") && block.hasSuffix("}"))
        XCTAssertNil(ContentParser.parse("no plan here").planJSON)
        XCTAssertNil(ContentParser.parse("[TAPPY_PLAN]{not json[/TAPPY_PLAN]").planJSON)
        // The visible text is still stripped of the block.
        XCTAssertFalse(parsed.text.contains("TAPPY_PLAN"))
    }

    func testPublishesTheBlockAsPlanUnderTheSessionAndBuildsTheCanonicalURLFromTheId() async throws {
        let api = ScriptedAPI()
        api.body = ok(#"{"id":"lSSFn0yDMF6w","path":"/plan/lSSFn0yDMF6w","url":"http://localhost:3107/plan/lSSFn0yDMF6w","reused":false}"#)
        let block = try XCTUnwrap(ContentParser.parse(reply).planJSON)

        let outcome = await service(api).publish(planJSON: block)

        XCTAssertEqual(outcome, .link(shareId: id, url: canonical))
        XCTAssertEqual(api.sent.count, 1)
        let sent = try XCTUnwrap(api.sent.first)
        XCTAssertEqual(sent.path, "/api/plans/share")
        XCTAssertEqual(sent.method, .post)
        XCTAssertTrue(sent.requiresAuth, "the route needs the session's Bearer token")
        let bodyData = try XCTUnwrap(sent.body)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(Array(json.keys), ["plan"], "exactly { plan } — no chat, no memory, no context")
        let plan = try XCTUnwrap(json["plan"] as? [String: Any])
        XCTAssertEqual(plan["title"] as? String, "Quy Nhơn 3 ngày 2 đêm")
        let days = try XCTUnwrap(plan["days"] as? [[String: Any]])
        let items = try XCTUnwrap(days[0]["items"] as? [[String: Any]])
        XCTAssertEqual(items[0]["photo_url"] as? String, "https://lh3.googleusercontent.com/p/A", "the real block, not a re-encoded model")
        XCTAssertEqual(items[0]["name"] as? String, "Bãi Kỳ Co")
    }

    func testTheSamePlanPublishedTwiceAsksTheServerTwiceAndGetsTheSameLink() async throws {
        let api = ScriptedAPI()
        api.body = ok(#"{"id":"lSSFn0yDMF6w","reused":true}"#)
        let block = try XCTUnwrap(ContentParser.parse(reply).planJSON)
        let s = service(api)
        let first = await s.publish(planJSON: block)
        let second = await s.publish(planJSON: block)
        XCTAssertEqual(first, .link(shareId: id, url: canonical))
        XCTAssertEqual(second, first)
        XCTAssertEqual(api.sent.count, 2, "no client cache, no client id — the server dedupes")
    }

    // MARK: - What is refused, and why

    func testSignedOutOrGuestNeverSendsThePlan() async throws {
        let api = ScriptedAPI()
        api.body = ok(#"{"id":"lSSFn0yDMF6w"}"#)
        let block = try XCTUnwrap(ContentParser.parse(reply).planJSON)
        let outcome = await service(api, authenticated: false).publish(planJSON: block)
        XCTAssertEqual(outcome, .signInRequired)
        XCTAssertEqual(api.sent.count, 0)
    }

    func testMissingOrNonJSONBlockIsNotSent() async {
        let api = ScriptedAPI()
        api.body = ok(#"{"id":"lSSFn0yDMF6w"}"#)
        for bad in ["", "not json", "[1,2,3]"] {
            let outcome = await service(api).publish(planJSON: bad)
            XCTAssertEqual(outcome, .noPlanPayload, bad)
        }
        XCTAssertEqual(api.sent.count, 0)
    }

    func testServerErrorsMapToTruthfulOutcomes() async throws {
        let block = try XCTUnwrap(ContentParser.parse(reply).planJSON)
        let cases: [(AppError, PlanShareOutcome)] = [
            (.authentication(reason: .unauthenticated), .signInRequired),   // 401
            (.authentication(reason: .forbidden), .signInRequired),         // 403
            (.validation(message: "invalid_plan"), .notShareable),          // 400
            (.network(status: 413, code: "payload_too_large"), .notShareable),
            (.network(status: 500, code: "server_error"), .failed),
            (.offline, .offline),                                           // no network / timeout
            (.unexpected(message: "decode"), .failed),                      // malformed body
        ]
        for (error, expected) in cases {
            let api = ScriptedAPI(); api.error = error
            let outcome = await service(api).publish(planJSON: block)
            XCTAssertEqual(outcome, expected, "\(error)")
        }
    }

    func testA200WithoutAUsableIdIsAFailureNeverAGuessedLink() async throws {
        let block = try XCTUnwrap(ContentParser.parse(reply).planJSON)
        for body in [#"{}"#, #"{"id":"short"}"#, #"{"id":"AbCdEfGhIjK!"}"#, #"{"url":"https://www.tappyai.com/plan/lSSFn0yDMF6w"}"#] {
            let api = ScriptedAPI(); api.body = ok(body)
            let outcome = await service(api).publish(planJSON: block)
            XCTAssertEqual(outcome, .failed, body)
        }
    }

    // MARK: - The canonical url

    func testPlanShareURLIsTheWebsURLForAServerIdAndNilOtherwise() {
        XCTAssertEqual(TappyShare.planShareURL(id), canonical)
        XCTAssertTrue(TappyShare.isShareableURL(canonical))
        for bad in [nil, "", "short", "AbCdEfGhIjK!", "AbCdEfGhIjK12", "../../etc"] {
            XCTAssertNil(TappyShare.planShareURL(bad), bad ?? "nil")
        }
    }

    // MARK: - What every target carries once the plan is published

    private func linkArtifact() throws -> (base: ShareArtifact, link: ShareArtifact) {
        let parsed = ContentParser.parse(reply)
        let base = ShareArtifactBuilder.buildPlanArtifact(try XCTUnwrap(parsed.plan), title: "Quy Nhơn 3 ngày 2 đêm", lang: "vi", planJSON: parsed.planJSON)
        return (base, ShareArtifactBuilder.planLinkArtifact(base, canonicalURL: canonical))
    }

    func testTheLinkArtifactIsTheCanonicalURLPlusOneLineNamingThePlan() throws {
        let (base, link) = try linkArtifact()
        XCTAssertTrue(link.isPlanLink)
        XCTAssertEqual(link.url, canonical)
        XCTAssertEqual(link.text, "Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm\n\(canonical)")
        XCTAssertFalse(link.text.contains("Bãi Kỳ Co"), "no second brochure in the text")
        XCTAssertEqual(link.planJSON, base.planJSON)
        // Before publishing: the text brochure on the brand url — nothing pretends to be a page.
        XCTAssertFalse(base.isPlanLink)
        XCTAssertEqual(base.url, TappyShare.canonicalOrigin)
    }

    func testFacebookZaloAndMessengerReceiveTheCanonicalPlanURL() throws {
        let (_, link) = try linkArtifact()
        let enc = try XCTUnwrap(canonical.addingPercentEncoding(withAllowedCharacters: .alphanumerics))
        XCTAssertEqual(TappyShare.buildShareURL(.facebook, canonicalURL: link.url), "https://www.facebook.com/sharer/sharer.php?u=\(enc)")
        XCTAssertEqual(TappyShare.buildShareURL(.zalo, canonicalURL: link.url), "https://sp.zalo.me/plugins/share?url=\(enc)")
        XCTAssertEqual(TappyShare.buildShareURL(.messenger, canonicalURL: link.url), "fb-messenger://share?link=\(enc)")
    }

    func testWhatsAppTelegramViberLINEAndEmailCarryTheCanonicalURL() throws {
        let (_, link) = try linkArtifact()
        let body = ShareArtifactBuilder.inboxBody(link, lang: "vi")
        XCTAssertEqual(body, link.text)
        XCTAssertTrue(body.hasSuffix(canonical))
        for t in [TappyShare.Target.whatsapp, .viber, .line, .email] {
            let s = try XCTUnwrap(TappyShare.buildTextShareURL(t, subject: link.subject, text: body, url: link.url), t.rawValue)
            XCTAssertTrue(try XCTUnwrap(s.removingPercentEncoding).contains(canonical), t.rawValue)
        }
        let tg = try XCTUnwrap(TappyShare.buildTextShareURL(.telegram, subject: link.subject, text: body, url: link.url))
        let encodedLink = try XCTUnwrap(canonical.addingPercentEncoding(withAllowedCharacters: .alphanumerics))
        XCTAssertTrue(tg.hasPrefix("https://t.me/share/url?url=\(encodedLink)"))
    }

    func testCopyTikTokInboxAndOtherAppsUseTheCanonicalURL() throws {
        // Copy copies `url` for a link artifact; TikTok, the Inbox and the system sheet send `text`,
        // which ends in the url. The Zalo app open copies `inboxBody` — the same text.
        let (_, link) = try linkArtifact()
        XCTAssertEqual(link.url, canonical)
        XCTAssertTrue(link.text.hasSuffix(canonical))
        XCTAssertEqual(ShareArtifactBuilder.inboxBody(link, lang: "vi"), link.text)
        XCTAssertFalse(link.url.contains("?"))
    }

    func testARecommendationShareIsUntouched() {
        let prose = ShareArtifactBuilder.buildProseArtifact(subject: "Bún bò", prose: "ngon")
        XCTAssertNil(prose.planJSON)
        XCTAssertFalse(prose.isPlanLink)
        XCTAssertEqual(prose.url, TappyShare.canonicalOrigin)
    }
}
