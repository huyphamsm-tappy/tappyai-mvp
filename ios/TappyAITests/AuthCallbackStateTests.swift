import XCTest
@testable import TappyAI

/// MOB-1 (security audit 2026-09-30): a sign-in callback is accepted only with the state this app
/// made for that sign-in, before it expires, once.
final class AuthCallbackStateTests: XCTestCase {
    private final class MemoryStorage: SecretStorage {
        var items: [String: String] = [:]
        func set(_ string: String, for key: String) throws { items[key] = string }
        func string(for key: String) -> String? { items[key] }
        func remove(_ key: String) { items[key] = nil }
    }

    private var storage: MemoryStorage!
    private var clock: Date!
    private var store: AuthCallbackStateStore!

    override func setUp() {
        super.setUp()
        storage = MemoryStorage()
        clock = Date(timeIntervalSince1970: 1_800_000_000)
        store = AuthCallbackStateStore(storage: storage, now: { [unowned self] in self.clock })
    }

    private func zaloCallback(state: String?, access: String = "ACCESS", refresh: String = "REFRESH") -> URL {
        var fragment = "access_token=\(access)&refresh_token=\(refresh)&expires_at=1800003600"
        if let state { fragment += "&state=\(state)" }
        return URL(string: "tappyai://auth/callback#\(fragment)")!
    }

    // MARK: Contract with the server (I6 / R24, `src/lib/auth/appState.ts`, `src/app/auth/confirm/route.ts`)

    /// The server refuses an `app_state` that does not match `^[A-Za-z0-9_-]{43,128}$`.
    func testStateFitsTheServersAcceptedFormat() {
        for _ in 0..<50 {
            let s = AuthCallbackStateStore.randomState()
            XCTAssertNotNil(s.range(of: "^[A-Za-z0-9_-]{43,128}$", options: .regularExpression), s)
        }
    }

    /// The exact fragment `/auth/confirm` redirects with for `platform=ios`:
    /// `access_token, refresh_token, expires_at, state` (URLSearchParams-encoded).
    func testTheServersCallbackIsAccepted() throws {
        let state = store.begin()
        let url = URL(string: "tappyai://auth/callback#access_token=eyJhbGciOi.eyJzdWIi.sig&refresh_token=r-t_1&expires_at=1800003600&state=\(state)")!
        XCTAssertTrue(AuthCallbackURL.isAuthCallback(url))
        XCTAssertEqual(try AuthCallbackPolicy.zalo(url, states: store), .tokens(access: "eyJhbGciOi.eyJzdWIi.sig", refresh: "r-t_1"))
    }

    /// `app_state` in the fragment is NOT the echo (Android reads `state`); a callback that only
    /// carries `app_state` is refused, so both apps stay on one name.
    func testOnlyStateIsReadNotAppState() {
        let state = store.begin()
        let url = URL(string: "tappyai://auth/callback#access_token=A&refresh_token=R&app_state=\(state)")!
        XCTAssertThrowsError(try AuthCallbackPolicy.zalo(url, states: store))
    }

    // MARK: State store

    func testStatesAreRandomAndUrlSafe() {
        let a = store.begin(), b = store.begin()
        XCTAssertNotEqual(a, b)
        XCTAssertGreaterThanOrEqual(a.count, 43, "32 random bytes, base64url")
        XCTAssertNil(a.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=&#?")))
    }

    func testMatchingStateIsAcceptedOnce() {
        let state = store.begin()
        XCTAssertTrue(store.consume(state))
        XCTAssertFalse(store.consume(state), "used states are deleted")
        XCTAssertNil(storage.items[AuthCallbackStateStore.key])
    }

    func testWrongStateIsRejectedAndClearsThePendingOne() {
        let state = store.begin()
        XCTAssertFalse(store.consume(state + "x"))
        XCTAssertFalse(store.consume(state), "a failed attempt burns the state too")
    }

    func testMissingOrEmptyStateIsRejected() {
        _ = store.begin()
        XCTAssertFalse(store.consume(nil))
        _ = store.begin()
        XCTAssertFalse(store.consume(""))
    }

    func testNoSignInStartedRejectsEverything() {
        XCTAssertFalse(store.consume("anything"))
    }

    func testExpiredStateIsRejected() {
        let state = store.begin()
        clock = clock.addingTimeInterval(AuthCallbackStateStore.ttl + 1)
        XCTAssertFalse(store.consume(state))
    }

    func testStateJustInsideTheWindowIsAccepted() {
        let state = store.begin()
        clock = clock.addingTimeInterval(AuthCallbackStateStore.ttl - 1)
        XCTAssertTrue(store.consume(state))
    }

    func testANewSignInReplacesTheOldState() {
        let old = store.begin()
        let new = store.begin()
        XCTAssertFalse(store.consume(old))
        _ = new
    }

    func testClearDropsThePendingState() {
        let state = store.begin()
        store.clear()
        XCTAssertFalse(store.consume(state))
    }

    // MARK: Zalo policy

    func testZaloCallbackWithMatchingStateImportsItsTokens() throws {
        let state = store.begin()
        let accepted = try AuthCallbackPolicy.zalo(zaloCallback(state: state), states: store)
        XCTAssertEqual(accepted, .tokens(access: "ACCESS", refresh: "REFRESH"))
    }

    /// The attack: the attacker's own magic link lands tokens in the callback with no state.
    func testZaloCallbackWithoutStateIsRejected() {
        _ = store.begin()
        XCTAssertThrowsError(try AuthCallbackPolicy.zalo(zaloCallback(state: nil), states: store)) {
            XCTAssertEqual($0 as? AuthCallbackError, .stateMismatch)
        }
    }

    func testZaloCallbackWithAnotherStateIsRejected() {
        _ = store.begin()
        XCTAssertThrowsError(try AuthCallbackPolicy.zalo(zaloCallback(state: "attacker"), states: store)) {
            XCTAssertEqual($0 as? AuthCallbackError, .stateMismatch)
        }
    }

    func testZaloCallbackIsNotReplayable() throws {
        let state = store.begin()
        let url = zaloCallback(state: state)
        _ = try AuthCallbackPolicy.zalo(url, states: store)
        XCTAssertThrowsError(try AuthCallbackPolicy.zalo(url, states: store))
    }

    func testZaloCallbackAfterExpiryIsRejected() {
        let state = store.begin()
        clock = clock.addingTimeInterval(AuthCallbackStateStore.ttl + 60)
        XCTAssertThrowsError(try AuthCallbackPolicy.zalo(zaloCallback(state: state), states: store))
    }

    func testZaloPkceCallbackNeedsTheStateToo() throws {
        let state = store.begin()
        let ok = URL(string: "tappyai://auth/callback?code=abc&state=\(state)")!
        XCTAssertEqual(try AuthCallbackPolicy.zalo(ok, states: store), .pkceCode)
        _ = store.begin()
        let noState = URL(string: "tappyai://auth/callback?code=abc")!
        XCTAssertThrowsError(try AuthCallbackPolicy.zalo(noState, states: store))
    }

    func testZaloCallbackWithStateButNoSessionIsRejected() {
        let state = store.begin()
        let url = URL(string: "tappyai://auth/callback#state=\(state)")!
        XCTAssertThrowsError(try AuthCallbackPolicy.zalo(url, states: store)) {
            XCTAssertEqual($0 as? AuthCallbackError, .unexpectedShape)
        }
    }

    // MARK: Google policy

    func testGoogleAcceptsOnlyAPkceCode() throws {
        XCTAssertEqual(try AuthCallbackPolicy.google(URL(string: "tappyai://auth/callback?code=abc")!), .pkceCode)
        XCTAssertThrowsError(try AuthCallbackPolicy.google(zaloCallback(state: nil)))
        XCTAssertThrowsError(try AuthCallbackPolicy.google(URL(string: "tappyai://auth/callback")!))
        XCTAssertThrowsError(try AuthCallbackPolicy.google(
            URL(string: "tappyai://auth/callback?code=abc#access_token=A&refresh_token=R")!))
    }

    // MARK: Links from outside the app

    func testAuthCallbacksAreNeverDeepLinkTargets() {
        let handler = DeepLinkHandler()
        XCTAssertNil(handler.target(for: "tappyai://auth/callback#access_token=A&refresh_token=R"))
        XCTAssertNil(handler.target(for: "tappyai://auth-callback#access_token=A&refresh_token=R"))
        XCTAssertNil(handler.target(for: "TAPPYAI://auth/callback?code=abc"))
        XCTAssertEqual(handler.target(for: "tappyai://chat"), .tab(.chat), "ordinary links still work")
    }

    func testRejectionMessageIsLocalized() {
        XCTAssertNotEqual(AuthCallbackError.stateMismatch.errorDescription, "auth.error.callbackRejected")
    }
}
