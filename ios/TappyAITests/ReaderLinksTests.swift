import XCTest
@testable import TappyAI

/// The quick-read sheet of an answer's link (web `readerLinks.ts`, `LinkDrawer`, `GET /api/link-preview`, owner 15/11/2026): which links open it,
/// and how its response is read.
final class ReaderLinksTests: XCTestCase {

    private func target(_ s: String, own: String? = "tappyai.com") -> URL? {
        guard let url = URL(string: s) else { return nil }
        return ReaderLinks.target(for: url, ownHost: own)
    }

    func testAnOrdinaryArticleOpensTheReader() {
        XCTAssertEqual(target("https://vnexpress.net/gia-vang-hom-nay.html")?.host, "vnexpress.net")
        XCTAssertNotNil(target("https://www.bbc.com/news/world-1"))
        XCTAssertNotNil(target("https://www.google.com/search?q=gia+vang"), "only google's maps keep their own behaviour")
        XCTAssertNotNil(target("https://vi.wikipedia.org/wiki/H%C3%A0_N%E1%BB%99i"))
    }

    func testMapsVideoAndSocialPagesKeepOpeningWhereTheyBelong() {
        for url in ["https://www.google.com/maps/place/Ho+Guom", "https://maps.google.com/?cid=1", "https://maps.app.goo.gl/abc",
                    "https://www.youtube.com/watch?v=1", "https://youtu.be/1", "https://www.tiktok.com/@a", "https://www.facebook.com/a",
                    "https://x.com/a", "https://zalo.me/1", "https://wa.me/84900000000"] {
            XCTAssertNil(target(url), url)
        }
    }

    func testBookingAndShoppingSitesAreForActingNotReading() {
        for url in ["https://www.agoda.com/vi-vn/hotel", "https://vexere.com/vi-VN/ve-xe", "https://www.lazada.vn/p/1", "https://shopee.vn/a",
                    "https://www.booking.com/hotel/vn/x.html", "https://tiki.vn/p", "https://www.traveloka.com/vi-vn", "https://www.thegioididong.com/dtdd"] {
            XCTAssertNil(target(url), url)
        }
    }

    func testAPartnerHandoffAlwaysLandsOnThePartner() {
        XCTAssertNil(target("https://go.isclix.com/deep_link/x?url=https%3A%2F%2Fvexere.com"))
        XCTAssertNil(target("https://www.tappyai.com/go/at?u=https%3A%2F%2Fexample.org%2Fp"))
        XCTAssertNil(target("https://example.org/go/at?u=x"), "Tappy's click path on any host stays a handoff")
    }

    func testOnlySafeHttpsLinksOfAnotherSiteQualify() {
        XCTAssertNil(target("http://vnexpress.net/a"), "http is not read here")
        XCTAssertNil(target("https://user:pass@vnexpress.net/a"))
        XCTAssertNil(target("https://127.0.0.1/a"))
        XCTAssertNil(target("https://www.tappyai.com/privacy"), "a link of this site is not an outside page to read")
        XCTAssertNil(target("https://chatgpt.com/share/abc"), "a page of another AI product is never opened here")
        XCTAssertNil(target("mailto:a@b.c"))
        XCTAssertNil(target("tel:113"))
        XCTAssertNotNil(target("https://www.tappyai.com/privacy", own: nil), "without an own host nothing is excluded for being ours")
    }

    // MARK: The preview

    func testAReadablePageGivesItsTitleDateAndPassages() {
        let json = #"{"ok":true,"url":"https://x.example/a","host":"x.example","title":"Giá vàng \n hôm nay","siteName":"VnExpress","description":"Tóm tắt","publishedAt":"2026-11-20T02:30:00.000Z","passages":["Đoạn một","Đoạn hai"]}"#
        let p = LinkPreview.read(Data(json.utf8))
        XCTAssertTrue(p.ok)
        XCTAssertEqual(p.title, "Giá vàng hôm nay", "one line")
        XCTAssertEqual(p.siteName, "VnExpress")
        XCTAssertEqual(p.description, "Tóm tắt")
        XCTAssertEqual(p.passages, ["Đoạn một", "Đoạn hai"])
        XCTAssertNotNil(p.publishedAt)
    }

    func testAPageThatCannotBeReadIsStillAnAnswer() {
        XCTAssertFalse(LinkPreview.read(Data(#"{"ok":false,"reason":"blocked"}"#.utf8)).ok)
        XCTAssertFalse(LinkPreview.read(Data("not json".utf8)).ok)
        XCTAssertFalse(LinkPreview.read(Data("[]".utf8)).ok)
        XCTAssertFalse(LinkPreview.read(Data(#"{"title":"x"}"#.utf8)).ok, "without ok:true nothing is trusted")
    }

    func testTheResponseIsBounded() {
        let many = (1...30).map { "\"p\($0)\"" }.joined(separator: ",")
        let long = String(repeating: "a", count: 5000)
        let p = LinkPreview.read(Data(#"{"ok":true,"title":"\#(long)","passages":[\#(many)],"publishedAt":"junk"}"#.utf8))
        XCTAssertEqual(p.passages.count, 8)
        XCTAssertEqual(p.title?.count, 200)
        XCTAssertNil(p.publishedAt, "a date that does not read is no date")
    }

    // MARK: A server that does not have the reader

    private func result(_ handler: @escaping @Sendable (Endpoint) async throws -> Data) async throws -> LinkPreviewResult {
        let service = LinkPreviewService(api: ChatTestAPI(handler: handler))
        return await service.preview(of: try XCTUnwrap(URL(string: "https://vnexpress.net/a")))
    }

    func testAMissingRouteMeansTheLinkOpensWhereItAlwaysDid() async throws {
        let r = try await result { _ in throw AppError.network(status: 404, code: nil) }
        XCTAssertEqual(r, .unavailable, "an older server has no /api/link-preview: no sheet that can only say 'cannot read'")
    }

    func testAnyOtherFailureIsAnUnreadablePageNotAMissingRoute() async throws {
        for failure in [AppError.network(status: 500, code: nil), AppError.network(status: 429, code: nil), AppError.offline] {
            let r = try await result { _ in throw failure }
            XCTAssertEqual(r, .page(LinkPreview()), "\(failure)")
        }
    }

    func testTheRequestAsksForExactlyThePageTapped() async throws {
        let api = ChatTestAPI { _ in Data(#"{"ok":true,"title":"T"}"#.utf8) }
        let r = await LinkPreviewService(api: api).preview(of: try XCTUnwrap(URL(string: "https://vnexpress.net/a?x=1&y=2")))
        guard case .page(let page) = r else { return XCTFail("a page") }
        XCTAssertTrue(page.ok)
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/link-preview")
        XCTAssertEqual(sent.query.first(where: { $0.name == "u" })?.value, "https://vnexpress.net/a?x=1&y=2")
        XCTAssertFalse(sent.requiresAuth, "nothing of the person is sent")
    }

    func testEveryStringTheSheetShowsHasACatalogEntry() {
        for key in ["chat.link.kind", "chat.link.loading", "chat.link.open", "chat.link.unreadable", "chat.link.note", "chat.link.published"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
