import XCTest
@testable import TappyAI

/// The share artifact is a WHITELIST, and iOS must produce the SAME brochure as web and
/// Android for the same `SharePlacesView`. The fixture is a real `/api/chat` `8:` payload,
/// shared with the web suite (`src/lib/share/__fixtures__/placesLiveView.food.json`).
///
/// ⚠️ Not executed in this repository's CI (no macOS runner); written for Xcode.
final class ShareArtifactTests: XCTestCase {

    /// Walks up from this source file to the repository root to find the shared fixture.
    private func fixtureData() throws -> Data {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<10 {
            let candidate = dir.appendingPathComponent("src/lib/share/__fixtures__/placesLiveView.food.json")
            if FileManager.default.fileExists(atPath: candidate.path) { return try Data(contentsOf: candidate) }
            dir = dir.deletingLastPathComponent()
        }
        throw XCTSkip("shared places fixture not found above \(#filePath)")
    }

    private func view() throws -> SharePlacesView {
        let data = try fixtureData()
        guard let v = SharePlacesViewParser.parse(annotationPayload: data) else {
            XCTFail("fixture did not parse"); throw XCTSkip("unparseable")
        }
        return v
    }

    func testParsesEveryWhitelistedFactFromTheRealFrame() throws {
        let v = try view()
        XCTAssertEqual(v.domain, "food")
        XCTAssertEqual(v.items.count, 8)
        let first = v.items[0]
        XCTAssertNotNil(first.address)
        XCTAssertNotNil(first.rating)
        XCTAssertNotNil(first.ratingCount)
        XCTAssertNotNil(first.openingHours)
        XCTAssertNotNil(first.phone)
        XCTAssertTrue(first.actions.contains { $0.kind == "maps" && $0.urlKind == "direct" && $0.url.hasPrefix("https://") })
    }

    func testBrochureHasHeaderEveryPlaceItsFactsAndFooter() throws {
        let a = ShareArtifactBuilder.buildPlacesArtifact(try view(), title: "Quán bún bò ngon ở TP.HCM", lang: "vi")
        XCTAssertEqual(a.subject, "TappyAI gợi ý: Quán bún bò ngon ở TP.HCM")
        XCTAssertTrue(a.text.hasPrefix("TappyAI gợi ý: Quán bún bò ngon ở TP.HCM\n\n1. "))
        XCTAssertTrue(a.text.hasSuffix("Gợi ý bởi TappyAI · www.tappyai.com"))
        XCTAssertEqual(a.url, "https://www.tappyai.com")
        for (i, p) in try view().items.enumerated() {
            XCTAssertTrue(a.text.contains("\(i + 1). \(p.name)"))
            if let ph = p.phone { XCTAssertTrue(a.text.contains("☎ \(ph)")) }
            if let h = p.openingHours { XCTAssertTrue(a.text.contains("🕐 \(h)")) }
            if let maps = p.actions.first(where: { $0.kind == "maps" && $0.urlKind == "direct" }) {
                XCTAssertTrue(a.text.contains("Bản đồ: \(maps.url)"))
            }
        }
        XCTAssertTrue(a.text.contains("★ 4.9 (5.946 đánh giá)"))
    }

    func testNothingInternalCanEnterTheText() throws {
        let a = ShareArtifactBuilder.buildPlacesArtifact(try view(), title: "x", lang: "vi")
        for forbidden in ["place:osm:", "shortlistPosition", "\"rank\"", "provenance", "evidence_type", "source_type",
                          "matchVerdict", "distanceKm", "priceSignal", "_tappy_", "tappy.places.v1",
                          "shopeefood.vn/search", "google.com/search"] {
            XCTAssertFalse(a.text.contains(forbidden), "leaked \(forbidden)")
        }
        for p in a.places { for l in p.links { XCTAssertTrue(l.url.hasPrefix("https://")) } }
    }

    func testDeterministic() throws {
        let v = try view()
        XCTAssertEqual(ShareArtifactBuilder.buildPlacesArtifact(v, title: "x", lang: "vi").text,
                       ShareArtifactBuilder.buildPlacesArtifact(v, title: "x", lang: "vi").text)
    }

    func testInboxBodyFitsWithoutCuttingAURL() throws {
        let v = try view()
        let big = SharePlacesView(domain: v.domain, items: Array(repeating: v.items, count: 6).flatMap { $0 })
        let a = ShareArtifactBuilder.buildPlacesArtifact(big, title: "Quán bún bò ngon ở TP.HCM", lang: "vi")
        XCTAssertGreaterThan(a.text.count, ShareArtifactBuilder.inboxMaxBody)
        let body = ShareArtifactBuilder.inboxBody(a, lang: "vi")
        XCTAssertLessThanOrEqual(body.count, ShareArtifactBuilder.inboxMaxBody)
        XCTAssertTrue(body.hasSuffix("Gợi ý bởi TappyAI · www.tappyai.com"))
        XCTAssertNotNil(body.range(of: #"và \d+ địa điểm khác"#, options: .regularExpression))
        let urls = body.components(separatedBy: .whitespacesAndNewlines).filter { $0.hasPrefix("https://") }
        XCTAssertFalse(urls.isEmpty)
        for u in urls { XCTAssertTrue(a.text.contains(u + "\n") || a.text.hasSuffix(u), "cut url \(u)") }
    }

    func testProseFallbackCarriesTheBrand() {
        let a = ShareArtifactBuilder.buildProseArtifact(subject: "hỏi gì đó", prose: "Câu trả lời.")
        XCTAssertTrue(a.text.hasPrefix("TappyAI\n\n"))
        XCTAssertTrue(a.text.hasSuffix("— TappyAI · tappyai.com"))
    }

    func testEnglishLabels() throws {
        let a = ShareArtifactBuilder.buildPlacesArtifact(try view(), title: "beef", lang: "en")
        XCTAssertTrue(a.text.hasPrefix("TappyAI recommends: beef"))
        XCTAssertTrue(a.text.contains("Maps: https://"))
        XCTAssertTrue(a.text.contains("(5,946 reviews)"))
        XCTAssertTrue(a.text.hasSuffix("Recommended by TappyAI · www.tappyai.com"))
    }

    // MARK: - Targets

    func testTargetsMatchWebOrder() {
        XCTAssertEqual(TappyShare.targets.map(\.rawValue),
                       ["facebook", "messenger", "zalo", "whatsapp", "telegram", "viber", "line", "tiktok", "email",
                        "inbox", "save", "copy", "native"])
    }

    func testQueriedSchemesAreExactlyTheMappedOnes() {
        let mapped = TappyShare.targets.compactMap(TappyShare.appScheme)
        XCTAssertEqual(mapped.sorted(), TappyShare.queriedSchemes.sorted())
        // Facebook is the sharer dialog, not an app handoff — Messenger is the app.
        XCTAssertNil(TappyShare.appScheme(.facebook))
        XCTAssertEqual(TappyShare.appScheme(.messenger), "fb-messenger")
        XCTAssertEqual(TappyShare.appScheme(.whatsapp), "whatsapp")
        XCTAssertEqual(TappyShare.appScheme(.telegram), "tg")
    }

    func testTextHandoffOnlyForEmailViberLineWhatsAppTelegram() {
        let text = "TappyAI gợi ý: bún bò\n\n1. Quán A\n\nGợi ý bởi TappyAI · www.tappyai.com"
        XCTAssertTrue(TappyShare.buildTextShareURL(.email, subject: "s", text: text)!.hasPrefix("mailto:?subject="))
        XCTAssertTrue(TappyShare.buildTextShareURL(.viber, subject: "s", text: text)!.hasPrefix("viber://forward?text="))
        let line = TappyShare.buildTextShareURL(.line, subject: "s", text: text)!
        XCTAssertTrue(line.hasPrefix("https://line.me/R/share?text="))
        XCTAssertEqual(line.replacingOccurrences(of: "https://line.me/R/share?text=", with: "").removingPercentEncoding, text)
        let wa = TappyShare.buildTextShareURL(.whatsapp, subject: "s", text: text)!
        XCTAssertTrue(wa.hasPrefix("https://wa.me/?text="))
        XCTAssertEqual(wa.replacingOccurrences(of: "https://wa.me/?text=", with: "").removingPercentEncoding, text)
        for t in [TappyShare.Target.facebook, .messenger, .zalo, .tiktok, .inbox, .save, .copy, .native] {
            XCTAssertNil(TappyShare.buildTextShareURL(t, subject: "s", text: text), t.rawValue)
        }
        XCTAssertNil(TappyShare.buildTextShareURL(.email, subject: "s", text: "  "))
        XCTAssertNil(TappyShare.buildTextShareURL(.whatsapp, subject: "s", text: "  "))
    }

    /// Telegram takes the link and the text apart; a bare link goes once, as the url.
    func testTelegramCarriesLinkAndTextSeparately() {
        let review = TappyShare.reviewURL("abc")
        let text = "TappyAI gợi ý: bún bò\n\n1. Quán A"
        let both = TappyShare.buildTextShareURL(.telegram, subject: "s", text: text, url: review)!
        XCTAssertTrue(both.hasPrefix("https://t.me/share/url?url="))
        let query = both.replacingOccurrences(of: "https://t.me/share/url?url=", with: "")
        let parts = query.components(separatedBy: "&text=")
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts[0].removingPercentEncoding, review)
        XCTAssertEqual(parts[1].removingPercentEncoding, text)

        let linkOnly = TappyShare.buildTextShareURL(.telegram, subject: "s", text: review)!
        XCTAssertFalse(linkOnly.contains("&text="))
        XCTAssertEqual(linkOnly.replacingOccurrences(of: "https://t.me/share/url?url=", with: "").removingPercentEncoding, review)
    }

    func testMessengerShareURLIsItsDeepLink() {
        let review = TappyShare.reviewURL("abc")
        let out = TappyShare.buildShareURL(.messenger, canonicalURL: review)!
        XCTAssertTrue(out.hasPrefix("fb-messenger://share?link="))
        XCTAssertEqual(out.replacingOccurrences(of: "fb-messenger://share?link=", with: "").removingPercentEncoding, review)
        XCTAssertNil(TappyShare.buildShareURL(.messenger, canonicalURL: "https://www.tappyai.com/reviews/x?token=secret"))
    }

    func testNonURLTargetsHaveNoShareURL() {
        let review = TappyShare.reviewURL("abc")
        for t in [TappyShare.Target.whatsapp, .telegram, .viber, .line, .tiktok, .email, .inbox, .save, .copy, .native] {
            XCTAssertNil(TappyShare.buildShareURL(t, canonicalURL: review), t.rawValue)
        }
        XCTAssertNotNil(TappyShare.buildShareURL(.facebook, canonicalURL: review))
        XCTAssertNotNil(TappyShare.buildShareURL(.zalo, canonicalURL: review))
    }
}
