import XCTest
@testable import TappyAI

/// CROSS-PLATFORM CCP CONTRACT (14 Sep 2026) — the iOS consumer of
/// `shared/ccp/commerce-action-fixtures.json`.
///
/// The Commerce Capability Platform resolves a Commerce Link ONCE on the server and projects it as
/// an Action with its facts and an already-RESOLVED label key. This client decodes it, renders the
/// key from its own catalogue and opens the URL verbatim. These cases prove, per provider, that
/// nothing is lost or re-derived on the way: provider, capability, label key, depth, loginRequired,
/// commerce facts, the opaque ids, the handoff target — and that "TikTok Shop" can never render as
/// Shopee, nor a retired grammar ever open. Same file, same cases as Web and Android.
final class CommerceActionContractTests: XCTestCase {

    private struct HandoffBody: Decodable { let linkId: String; let requestId: String }
    private struct Schedule: Decodable { let date: String; let time: String? }
    private struct Expect: Decodable {
        let host: String
        let providerId: String
        let capability: String
        let labelKey: String
        let labelVi: String
        let depth: Int
        let loginRequired: Bool
        let handoffBody: HandoffBody
        let forbiddenHosts: [String]
        let schedule: Schedule?
    }
    private struct Case: Decodable {
        let id: String
        let action: LivePlaceAction
        let expect: Expect
    }
    private struct ShoppingExpect: Decodable { let labelKey: String; let nativeLabelKey: String?; let isSearch: Bool; let host: String }
    private struct ShoppingCase: Decodable { let id: String; let view: ShoppingCommerceView; let expect: ShoppingExpect }
    private struct CtaCase: Decodable {
        let id: String
        let expectVisibleContains: [String]
        let expectCtaLabels: [String]
        let expectCtaHosts: [String]
        let expectForbiddenHosts: [String]?
        let expectFollowups: [String]
    }
    private struct FixtureFile: Decodable {
        let version: Int
        let commerceLabelKeys: [String]
        let retiredGrammars: [String]
        let cases: [Case]
        let shoppingCommerceViews: [ShoppingCase]
        let modelCtaBlocks: [CtaCase]
    }

    private func fixtureURL() throws -> URL {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<10 {
            let candidate = dir.appendingPathComponent("shared").appendingPathComponent("ccp").appendingPathComponent("commerce-action-fixtures.json")
            if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
            dir = dir.deletingLastPathComponent()
        }
        throw XCTSkip("shared/ccp/commerce-action-fixtures.json not found above \(#filePath)")
    }

    private func load() throws -> FixtureFile {
        try JSONDecoder().decode(FixtureFile.self, from: Data(contentsOf: try fixtureURL()))
    }

    private func host(_ url: String) -> String { URL(string: url)?.host?.lowercased() ?? "" }

    /// The annotation line the server sends, wrapping one place whose only action is the fixture's.
    private func liveFrame(_ actionJSON: Data) -> String {
        let action = String(decoding: actionJSON, as: UTF8.self)
        return "8:[{\"kind\":\"\(placesAnnotationKind)\",\"v\":1,\"domain\":\"shopping\",\"items\":[{\"id\":\"p1\",\"domain\":\"shopping\",\"kind\":\"place\",\"name\":\"Subject\",\"rank\":0,\"actions\":[\(action)]}]}]"
    }

    func testEveryProviderCaseSurvivesTheLiveAnnotationAndRendersTheServersKey() throws {
        let file = try load()
        XCTAssertEqual(file.version, 1)
        var failures: [String] = []
        let encoder = JSONEncoder()

        for c in file.cases {
            let line = liveFrame(try encoder.encode(c.action))
            guard case let .places(view)? = DataStreamLineParser.parse(line: line) else { failures.append("[\(c.id)] the annotation did not decode"); continue }
            guard let live = view.items.first?.actions.first, let card = view.items.first?.toCardView().actions.first else { failures.append("[\(c.id)] no action decoded"); continue }
            guard let commerce = card.commerce else { failures.append("[\(c.id)] commerce facts were dropped by the projection"); continue }

            func check<T: Equatable>(_ what: String, _ expected: T, _ actual: T) {
                if expected != actual { failures.append("[\(c.id)] \(what): expected \(expected) but was \(actual)") }
            }
            check("providerId", c.expect.providerId, commerce.providerId)
            check("capability", c.expect.capability, commerce.capability ?? "")
            check("depth", c.expect.depth, commerce.depth)
            check("loginRequired", c.expect.loginRequired, commerce.loginRequired)
            check("handoff", c.action.commerce?.handoff ?? "", commerce.handoff ?? "")
            if let s = c.expect.schedule {
                check("facts.schedule.date", s.date, commerce.facts?.schedule?.date ?? "")
                check("facts.schedule.time", s.time ?? "", commerce.facts?.schedule?.time ?? "")
            }
            check("handoff linkId", c.expect.handoffBody.linkId, commerce.linkId)
            check("handoff requestId", c.expect.handoffBody.requestId, commerce.requestId)
            let body = CommerceHandoffReporter.body(for: commerce)
            check("beacon", CommerceHandoffBody(linkId: c.expect.handoffBody.linkId, requestId: c.expect.handoffBody.requestId, platform: "ios"), body ?? CommerceHandoffBody(linkId: "", requestId: ""))
            if let data = try? encoder.encode(body), String(decoding: data, as: UTF8.self).contains("http") { failures.append("[\(c.id)] the beacon carries a URL") }

            // The URL is opened VERBATIM: right host, never a sibling merchant, never a retired grammar.
            check("url", c.action.url, card.url)
            check("host", c.expect.host, host(card.url))
            if c.expect.forbiddenHosts.contains(host(card.url)) { failures.append("[\(c.id)] opens a forbidden merchant \(host(card.url))") }
            if let retired = file.retiredGrammars.first(where: { card.url.hasPrefix($0) }) { failures.append("[\(c.id)] opens a retired grammar \(retired)") }

            // The label: the wire key, rendered from this client's catalogue — never re-derived.
            check("labelKey on the wire", c.expect.labelKey, live.labelKey)
            let label = placeActionLabel(labelKey: card.labelKey, urlKind: card.urlKind, platform: card.platform)
            let leaf = c.expect.labelKey.split(separator: ".").last.map(String.init) ?? ""
            check("catalogue key", "place.action.\(leaf)", label.key)
            check("label platform", card.platform ?? "", label.platform ?? "")
        }
        XCTAssertTrue(failures.isEmpty, "Commerce action contract drift on iOS:\n" + failures.joined(separator: "\n"))
    }

    func testTheShoppingCardDecodesTheSameCommerceViewFromTheMarker() throws {
        let file = try load()
        var failures: [String] = []
        let encoder = JSONEncoder()
        for v in file.shoppingCommerceViews {
            let view = String(decoding: try encoder.encode(v.view), as: UTF8.self)
            let marker = "[TAPPY_SHOPPING]{\"v\":1,\"entities\":[{\"key\":\"e1\",\"config\":\"128GB\",\"matchesRequest\":\"khop\",\"recommended\":true,\"offers\":[],\"commerceLinks\":[\(view)]}],\"recommendation\":null}[/TAPPY_SHOPPING]\n\nMình nghiêng về iPhone 16 Pro."
            let parsed = ContentParser.parse(marker)
            guard let entity = parsed.shopping?.entities.first else { failures.append("[\(v.id)] the shopping marker did not decode"); continue }
            let handoffs = entity.commerceHandoffs
            guard let link = (handoffs.detail + handoffs.search).first, handoffs.detail.count + handoffs.search.count == 1 else { failures.append("[\(v.id)] commerceLinks were dropped"); continue }
            if link.isSearch != v.expect.isSearch { failures.append("[\(v.id)] search/detail split differs") }
            if host(link.url) != v.expect.host { failures.append("[\(v.id)] host \(host(link.url))") }
            let action = link.asPlaceCardAction
            // A native client never re-derives: a legacy view without labelKey renders the honest fallback.
            let expectedKey = v.expect.nativeLabelKey ?? v.expect.labelKey
            if action.labelKey != expectedKey { failures.append("[\(v.id)] labelKey: expected \(expectedKey) but was \(action.labelKey)") }
            let label = placeActionLabel(labelKey: action.labelKey, urlKind: action.urlKind, platform: action.platform)
            let leaf = expectedKey.split(separator: ".").last.map(String.init) ?? ""
            if label.key != "place.action.\(leaf)" { failures.append("[\(v.id)] catalogue key \(label.key)") }
            if label.platform != link.merchantName { failures.append("[\(v.id)] label platform \(label.platform ?? "nil")") }
            if action.commerce?.linkId != link.linkId || action.commerce?.requestId != link.requestId { failures.append("[\(v.id)] opaque ids lost") }
            if parsed.text.contains("TAPPY_SHOPPING") { failures.append("[\(v.id)] marker leaked") }
        }
        XCTAssertTrue(failures.isEmpty, "Shopping commerce view drift on iOS:\n" + failures.joined(separator: "\n"))
    }

    func testALegacyMarkerWithoutLabelKeyNeverRendersAStrongerVerbThanSearchOrView() {
        let detail = ShoppingCommerceView(url: "https://www.dienmayxanh.com/dien-thoai/iphone-16-pro", merchantName: "Điện Máy Xanh", kind: "DETAIL_HANDOFF")
        let search = ShoppingCommerceView(url: "https://shopee.vn/search?keyword=x", merchantName: "Shopee", kind: "SEARCH_HANDOFF")
        XCTAssertEqual(placeActionLabel(labelKey: detail.asPlaceCardAction.labelKey, urlKind: "direct", platform: "Điện Máy Xanh").key, "place.action.viewOn")
        XCTAssertEqual(placeActionLabel(labelKey: search.asPlaceCardAction.labelKey, urlKind: "search", platform: "Shopee").key, "place.action.searchOn")
    }

    func testTheServerValidatedCtaBlockRendersOnlyTheRequestedMerchantsButtons() throws {
        // The server validates the model's [CTA_BUTTONS] once; this client parses what it ships.
        let file = try load()
        for b in file.modelCtaBlocks {
            let buttons = zip(b.expectCtaLabels, b.expectCtaHosts).map { label, host in
                "{\"label\":\"\(label)\",\"type\":\"website\",\"url\":\"https://\(host)/x\"}"
            }.joined(separator: ",")
            var shipped = (b.expectVisibleContains.first ?? "") + "\n\n[CTA_BUTTONS]{\"buttons\":[\(buttons)]}[/CTA_BUTTONS]"
            if !b.expectFollowups.isEmpty { shipped += "\n[FOLLOWUPS]" + b.expectFollowups.joined(separator: "|") }
            let parsed = ContentParser.parse(shipped)
            XCTAssertEqual(parsed.ctaButtons.map(\.label), b.expectCtaLabels, "[\(b.id)] labels")
            XCTAssertEqual(parsed.ctaButtons.map { host($0.url) }, b.expectCtaHosts, "[\(b.id)] hosts")
            for h in b.expectForbiddenHosts ?? [] { XCTAssertFalse(parsed.ctaButtons.contains { host($0.url) == h }, "[\(b.id)] forbidden host \(h)") }
            XCTAssertEqual(parsed.followups, b.expectFollowups, "[\(b.id)] followups")
            XCTAssertFalse(parsed.text.contains("CTA_BUTTONS"), "[\(b.id)] marker leaked")
        }
    }

    func testEveryListedCommerceKeyResolvesAndAnUnknownKeyFallsBackToOpenNeverToAPromise() throws {
        let file = try load()
        for key in file.commerceLabelKeys {
            let leaf = key.split(separator: ".").last.map(String.init) ?? ""
            let label = placeActionLabel(labelKey: key, urlKind: "direct", platform: "Merchant")
            XCTAssertEqual(label.key, "place.action.\(leaf)", "\(key) resolves to its own catalogue entry")
        }
        XCTAssertEqual(placeActionLabel(labelKey: "v3.action.checkoutNow", urlKind: "direct", platform: "Merchant").key, "place.action.open")
        XCTAssertEqual(placeActionLabel(labelKey: "v3.action.unknownSearch", urlKind: "search", platform: "Merchant").key, "place.action.searchOn")
        // A platform key without its platform drops to the plain verb, as web does.
        XCTAssertEqual(placeActionLabel(labelKey: "v3.action.purchaseOn", urlKind: "direct", platform: nil), PlaceActionLabel(key: "place.action.purchase", platform: nil))
    }

    func testTheBeaconIsOpaqueIdsOnlyAndNeverBlocksTheTap() {
        final class Recorder: CommerceHandoffTransport, CommerceEventSink, @unchecked Sendable {
            var posted: [CommerceHandoffBody] = []
            var events: [(CommerceHandoffEvent, String?)] = []
            var fail = false
            let lock = NSLock()
            func post(_ body: CommerceHandoffBody) async throws { lock.lock(); posted.append(body); lock.unlock(); if fail { throw URLError(.notConnectedToInternet) } }
            func record(_ event: CommerceHandoffEvent, providerId: String, capability: String?, depth: Int, loginRequired: Bool, reason: String?) { lock.lock(); events.append((event, reason)); lock.unlock() }
        }
        let facts = LiveCommerceFacts(linkId: "b2c3d4e5f60718293a4b5c6d", requestId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", providerId: "tiktokshop", depth: 3, guestDepth: 3, authRequiredAt: "before_checkout", loginRequired: true, handoff: "merchant_login", capability: "product_detail")

        let ok = Recorder()
        CommerceHandoffReporter.tapped(facts, opened: true, transport: ok, sink: ok)
        let e1 = expectation(description: "posted")
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.3) { e1.fulfill() }
        wait(for: [e1], timeout: 2)
        XCTAssertEqual(ok.posted, [CommerceHandoffBody(linkId: facts.linkId, requestId: facts.requestId, platform: "ios")])
        XCTAssertEqual(ok.events.map(\.0), [.tapped, .attempted])

        let none = Recorder()
        CommerceHandoffReporter.tapped(facts, opened: false, transport: none, sink: none)
        XCTAssertEqual(none.events.map(\.0), [.tapped, .failed])
        XCTAssertEqual(none.events.last?.1, "no_handler")
        XCTAssertTrue(none.posted.isEmpty)

        let dead = Recorder(); dead.fail = true
        CommerceHandoffReporter.tapped(facts, opened: true, transport: dead, sink: dead)
        let e2 = expectation(description: "failed")
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.3) { e2.fulfill() }
        wait(for: [e2], timeout: 2)
        XCTAssertEqual(dead.events.map(\.0), [.tapped, .attempted, .failed])
        XCTAssertEqual(dead.events.last?.1, "beacon")

        XCTAssertNil(CommerceHandoffReporter.body(for: nil))
        XCTAssertNil(CommerceHandoffReporter.body(for: LiveCommerceFacts(linkId: "", requestId: "x")))
    }
}
