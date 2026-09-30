import AuthenticationServices
import XCTest
@testable import TappyAI

/// Sign in with Apple (A3) and push (A5) — the parts that run without an Apple ID or a real device.
final class AppleAndPushTests: XCTestCase {

    private final class MemoryStorage: SecretStorage {
        var items: [String: String] = [:]
        func set(_ string: String, for key: String) throws { items[key] = string }
        func string(for key: String) -> String? { items[key] }
        func remove(_ key: String) { items[key] = nil }
    }

    // MARK: Nonce

    func testNonceUsesOnlyTheAllowedCharactersAndTheRequestedLength() {
        let allowed = Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        for length in [1, 16, 32, 64] {
            let nonce = AppleSignIn.randomNonce(length: length)
            XCTAssertEqual(nonce.count, length)
            XCTAssertTrue(nonce.allSatisfy { allowed.contains($0) }, nonce)
        }
    }

    func testNoncesDoNotRepeatAndCoverTheAlphabetEvenly() {
        let many = (0..<300).map { _ in AppleSignIn.randomNonce() }
        XCTAssertEqual(Set(many).count, many.count)
        // 300 × 32 = 9,600 characters over 65 symbols ≈ 148 each. Rejection sampling keeps every symbol
        // near that; a plain `% 65` would put the first 60 symbols ~33% above the last five.
        var counts: [Character: Int] = [:]
        for nonce in many { for c in nonce { counts[c, default: 0] += 1 } }
        XCTAssertEqual(counts.count, 65)
        XCTAssertLessThan(counts.values.max()! - counts.values.min()!, 90)
    }

    // MARK: Name (first authorisation only)

    func testDisplayNameFromApplesComponents() {
        var name = PersonNameComponents()
        name.givenName = "Minh"; name.familyName = "Anh"
        let text = AppleSignIn.displayName(name)
        XCTAssertTrue(text?.contains("Minh") == true && text?.contains("Anh") == true, text ?? "nil")
    }

    func testNoNameWhenAppleSendsNone() {
        XCTAssertNil(AppleSignIn.displayName(nil), "every sign-in after the first")
        XCTAssertNil(AppleSignIn.displayName(PersonNameComponents()))
        var blank = PersonNameComponents(); blank.givenName = "  "
        XCTAssertNil(AppleSignIn.displayName(blank))
    }

    // MARK: Revocation

    func testOnlyARevokedCredentialSignsOut() {
        XCTAssertEqual(AppleSignIn.action(for: .revoked), .signOut)
        XCTAssertEqual(AppleSignIn.action(for: .authorized), .keep)
        XCTAssertEqual(AppleSignIn.action(for: .transferred), .keep)
        XCTAssertEqual(AppleSignIn.action(for: .notFound), .keep, "a new phone or the simulator must not sign anyone out")
    }

    func testCredentialStoreRecordsAndClears() {
        let storage = MemoryStorage()
        let store = AppleCredentialStore(storage: storage)
        XCTAssertNil(store.userId)
        store.record("001234.abcdef")
        XCTAssertEqual(store.userId, "001234.abcdef")
        store.clear()
        XCTAssertNil(store.userId)
    }

    // MARK: Push

    func testNotificationOpensTheServersLinkFirst() {
        // The server's FCM payload uses `link` (src/lib/notifications/fcm.ts); web push uses `url`.
        XCTAssertEqual(NotificationManager.destination(in: ["link": "/reviews/abc", "url": "/deals"]), "/reviews/abc")
        XCTAssertEqual(NotificationManager.destination(in: ["url": "/deals"]), "/deals")
        XCTAssertEqual(NotificationManager.destination(in: ["aps": ["alert": "x"], "link": "/group/g1"]), "/group/g1")
    }

    func testNotificationWithoutAUsableDestinationOpensNothing() {
        XCTAssertNil(NotificationManager.destination(in: [:]))
        XCTAssertNil(NotificationManager.destination(in: ["link": "   "]))
        XCTAssertNil(NotificationManager.destination(in: ["link": 42, "url": ["a"]]))
    }

    func testANotificationCannotOpenASignInCallback() {
        // Whatever the payload says goes through DeepLinkHandler, which refuses auth callbacks (MOB-1).
        let link = NotificationManager.destination(in: ["link": "tappyai://auth/callback#access_token=A&refresh_token=R"])
        XCTAssertNil(DeepLinkHandler().target(for: link ?? ""))
    }
}
