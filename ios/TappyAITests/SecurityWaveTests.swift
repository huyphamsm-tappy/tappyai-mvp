import XCTest
import UIKit
@testable import TappyAI

/// Security audit 04/11 (iOS I-01, I-04, I-06, I-07, I-08). One suite for the small guards the audit asked for.
@MainActor
final class SecurityWaveTests: XCTestCase {

    // MARK: - I-01 YouTube id and the embed page

    func testYouTubeIdIsExactlyElevenSafeCharacters() {
        XCTAssertTrue(ExternalSource.isValidYouTubeId("dQw4w9WgXcQ"))
        XCTAssertTrue(ExternalSource.isValidYouTubeId("a-_B1c2D3e4"))
        for bad in ["", "short", "dQw4w9WgXcQx", "dQw4w9WgXc\"", "dQw4w9WgXc'", "dQw4w9WgX<>", "dQw4w9 WgXc", "dQw4w9WgXc\n", "dQw4w9WgXcé"] {
            XCTAssertFalse(ExternalSource.isValidYouTubeId(bad), bad)
        }
    }

    func testExtractYouTubeIdReturnsOnlyAPlainId() {
        XCTAssertEqual(ExternalSource.extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        XCTAssertEqual(ExternalSource.extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=10"), "dQw4w9WgXcQ")
        XCTAssertNil(ExternalSource.extractYouTubeId("https://youtu.be/x\"onload=\"alert(1)"))
        XCTAssertNil(ExternalSource.extractYouTubeId("https://youtu.be/dQw4w9WgXc\"><script>"))
        XCTAssertNil(ExternalSource.extractYouTubeId("https://youtu.be/short"))
        XCTAssertNil(ExternalSource.extractYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ"))
    }

    func testEmbedPageMayOnlyNavigateToYouTube() {
        XCTAssertTrue(YouTubeEmbedView.allowsMainFrameNavigation(to: nil))
        XCTAssertTrue(YouTubeEmbedView.allowsMainFrameNavigation(to: URL(string: "about:blank")))
        XCTAssertTrue(YouTubeEmbedView.allowsMainFrameNavigation(to: URL(string: "https://www.youtube.com/")))
        XCTAssertTrue(YouTubeEmbedView.allowsMainFrameNavigation(to: URL(string: "https://youtube.com/watch?v=dQw4w9WgXcQ")))
        XCTAssertTrue(YouTubeEmbedView.allowsMainFrameNavigation(to: URL(string: "https://m.youtube.com/x")))
        for bad in ["https://evil.example/x", "http://www.youtube.com/", "https://youtube.com.evil.example/", "https://notyoutube.com/",
                    "javascript:alert(1)", "file:///etc/hosts", "tel:+84123456789"] {
            XCTAssertFalse(YouTubeEmbedView.allowsMainFrameNavigation(to: URL(string: bad)), bad)
        }
    }

    // MARK: - I-07 links out of a legal page

    func testLegalPageOpensOnlyMailAndWebLinks() {
        XCTAssertEqual(LegalLinkPolicy.externalTarget(for: URL(string: "mailto:hello@tappyai.com")!)?.absoluteString, "mailto:hello@tappyai.com")
        XCTAssertEqual(LegalLinkPolicy.externalTarget(for: URL(string: "https://www.apple.com/legal/")!)?.absoluteString, "https://www.apple.com/legal/")
        for bad in ["tel:+84123456789", "itms-apps://apps.apple.com/app/id1", "file:///etc/hosts", "javascript:alert(1)", "sms:+84123456789",
                    "https://apple.com@evil.example/"] {
            XCTAssertNil(LegalLinkPolicy.externalTarget(for: URL(string: bad)!), bad)
        }
    }

    // MARK: - I-06 ids from links and pushes

    func testSafeIdAdmitsPlainIdsAndUUIDs() {
        for ok in ["123", "abc", "g1", "u-1", "r_9", "3f2a-uuid", UUID().uuidString, String(repeating: "a", count: 64)] {
            XCTAssertTrue(DeepLinkHandler.isSafeId(ok), ok)
        }
        for bad in ["", "..", "a/b", "a?x=1", "a#b", "a%2fb", "a b", "a.b", "é", String(repeating: "a", count: 65)] {
            XCTAssertFalse(DeepLinkHandler.isSafeId(bad), bad)
        }
    }

    func testContentLinksWithAnUnsafeIdResolveToNothing() {
        let handler = DeepLinkHandler()
        XCTAssertNil(handler.target(for: "/group/..%2fadmin"))
        XCTAssertNil(handler.target(for: "/reviews/a%3Fb"))
        XCTAssertNil(handler.target(for: "/users/a.b"))
        XCTAssertNil(handler.target(forPath: "/group/" + String(repeating: "a", count: 65)))
        // the ordinary links keep working
        XCTAssertEqual(handler.target(for: "/group/g1"), .group(id: "g1"))
        XCTAssertEqual(handler.target(for: "/group/new"), .groupCreate)
        XCTAssertEqual(handler.target(for: "/reviews/123"), .review(id: "123"))
    }

    // MARK: - I-04 a fresh install does not resume the previous owner's session

    private func tokens() -> AuthTokens {
        AuthTokens(accessToken: "a", refreshToken: "r", expiresAt: Date().addingTimeInterval(3600))
    }

    func testFirstLaunchOfAFreshInstallClearsTheLeftoverSession() throws {
        let suite = "SecurityWaveTests.fresh.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let storage = InMemoryTokenStorage(tokens())

        XCTAssertTrue(FreshInstallGuard.run(defaults: defaults, appDomain: suite, tokens: storage))
        XCTAssertNil(storage.load(), "the Keychain item left by a previous install is gone")
        // later launches never clear again
        storage.save(tokens())
        XCTAssertFalse(FreshInstallGuard.run(defaults: defaults, appDomain: suite, tokens: storage))
        XCTAssertNotNil(storage.load())
    }

    func testAnUpdateOfAnExistingInstallKeepsItsSession() throws {
        let suite = "SecurityWaveTests.update.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        defaults.set("1990", forKey: "guest_age_declaration") // something this app wrote before the marker existed
        let storage = InMemoryTokenStorage(tokens())

        XCTAssertFalse(FreshInstallGuard.run(defaults: defaults, appDomain: suite, tokens: storage))
        XCTAssertNotNil(storage.load(), "the person who updates stays signed in")
        XCTAssertTrue(defaults.bool(forKey: FreshInstallGuard.markerKey), "and the marker is set, so it is decided once")
    }

    // MARK: - I-08 a photo that cannot be decoded is not sent as it came

    func testReencodedPhotoIsAFreshJPEGOrNothing() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
        let png = renderer.pngData { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        let jpeg = try XCTUnwrap(CreateReviewViewModel.reencodedPhoto(png))
        XCTAssertEqual(Array(jpeg.prefix(2)), [0xFF, 0xD8], "a JPEG, re-drawn from the decoded image")
        XCTAssertNil(CreateReviewViewModel.reencodedPhoto(Data([0x00, 0x01, 0x02, 0x03])), "bytes the system cannot decode are never passed through")
        XCTAssertNil(CreateReviewViewModel.reencodedPhoto(Data()))
    }
}
