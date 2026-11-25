import XCTest
@testable import TappyAI

/// Scam Shield: a public result page to warn the group a link came from (web `POST /api/scam-shield/share`).
final class ScamShareLinkTests: XCTestCase {
    func testOnlyAPlainResultPathOnOurOwnOriginIsShared() {
        XCTAssertEqual(UtilityToolsService.sharedResultURL(path: "/r/abc-123")?.absoluteString,
                       TappyShare.canonicalOrigin + "/r/abc-123")
        for bad in [nil, "", "/r/", "/plan/x", "https://evil.example/r/x", "/r/../x", "/r/a b", "//evil.example/r/x"] as [String?] {
            XCTAssertNil(UtilityToolsService.sharedResultURL(path: bad), String(describing: bad))
        }
    }

    func testTheShareCallSendsTheCheckedAddressAndLanguage() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"slug":"s1","path":"/r/s1","url":"https://evil.example/ignored","level":"danger"}"#.utf8)
        let link = try await UtilityToolsService(api: api).shareScamResult(url: "http://bad.example", locale: "en")
        XCTAssertEqual(link.absoluteString, TappyShare.canonicalOrigin + "/r/s1", "the server's own `url` is not trusted")
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/scam-shield/share")
        let body = try XCTUnwrap(sent.body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] })
        XCTAssertEqual(body["locale"], "en")
        XCTAssertEqual(body["url"], "http://bad.example")
    }

    func testAnUnknownLanguageIsSentAsVietnamese() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"path":"/r/s1"}"#.utf8)
        _ = try await UtilityToolsService(api: api).shareScamResult(url: "http://bad.example", locale: "fr")
        let body = try XCTUnwrap(api.sentEndpoints.first?.body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] })
        XCTAssertEqual(body["locale"], "vi")
    }

    func testTheFlagIsReadFromConfig() throws {
        let flags = try JSONDecoder().decode(AppConfig.Flags.self, from: Data(#"{"showProUpgrade":false,"publicShare":true}"#.utf8))
        XCTAssertEqual(flags.publicShare, true)
        let old = try JSONDecoder().decode(AppConfig.Flags.self, from: Data(#"{"showProUpgrade":false}"#.utf8))
        XCTAssertNil(old.publicShare, "an older server leaves the button hidden")
    }
}
