import XCTest
@testable import TappyAI

/// The login state machine (MUST-FIX 1): guest, signed in, session ended, re-login, and the held chat
/// message. A guest session is a real token — only its `is_anonymous` claim says it is not an account.
@MainActor
final class AuthStateMachineTests: XCTestCase {

    private func store(_ stored: AuthTokens?, refresh: Result<AuthTokens, Error> = .failure(AppError.authentication(reason: .refreshFailed))) -> (SessionStore, InMemoryTokenStorage) {
        let storage = InMemoryTokenStorage(stored)
        let s = SessionStore(storage: storage, refresher: MockTokenRefreshing(result: refresh))
        return (s, storage)
    }

    // MARK: Claims

    func testClaimsReadSubjectAndGuestFlag() {
        XCTAssertEqual(TestFixtures.tokens(expiresIn: 60, sub: "g-1", anonymous: true).claims,
                       JWTClaims(subject: "g-1", isAnonymous: true))
        XCTAssertEqual(TestFixtures.tokens(expiresIn: 60, sub: "u-1").claims,
                       JWTClaims(subject: "u-1", isAnonymous: false))
        XCTAssertNil(JWTClaims(jwt: "not-a-jwt"))
    }

    // MARK: Guest

    func testStoredGuestSessionBootsAsGuestNotSignedIn() {
        let (s, _) = store(TestFixtures.tokens(expiresIn: 3600, sub: "g-1", anonymous: true))
        s.bootstrap()
        XCTAssertEqual(s.state, .anonymous, "the bug: a stored guest token read as a signed-in account")
        XCTAssertFalse(s.state.isAuthenticated)
        XCTAssertNil(s.userId)
        XCTAssertEqual(s.anonymousId, "g-1")
    }

    func testSdkGuestSessionNeverBecomesAccount() {
        let (s, _) = store(nil)
        s.bootstrap()
        s.didAuthenticate(TestFixtures.tokens(expiresIn: 3600, sub: "g-2", anonymous: true), onboarded: true)
        XCTAssertEqual(s.state, .anonymous)
        XCTAssertNil(s.userId)
    }

    // MARK: Signed in, logout, re-login

    func testSignedInThenLogoutThenSignInAgain() {
        let (s, storage) = store(nil)
        s.bootstrap()
        s.didAuthenticate(TestFixtures.tokens(expiresIn: 3600, sub: "u-1"), onboarded: true)
        XCTAssertEqual(s.state, .authenticated(userId: "u-1"))
        s.logout()
        XCTAssertEqual(s.state, .anonymous)
        XCTAssertNil(storage.load())
        s.didAuthenticate(TestFixtures.tokens(expiresIn: 3600, sub: "u-1"), onboarded: true)
        XCTAssertEqual(s.state, .authenticated(userId: "u-1"))
        XCTAssertNil(s.notice)
    }

    func testGuestSessionDoesNotOverrideAnAccount() {
        let (s, _) = store(TestFixtures.tokens(expiresIn: 3600, sub: "u-1"))
        s.bootstrap()
        s.adoptAnonymousSession(TestFixtures.tokens(expiresIn: 3600, sub: "g-1", anonymous: true), anonymousId: "g-1")
        XCTAssertEqual(s.state, .authenticated(userId: "u-1"))
    }

    // MARK: Session ended

    func testAccountSessionThatCannotRenewFallsBackToGuestWithANotice() async {
        let (s, storage) = store(TestFixtures.tokens(expiresIn: -10, sub: "u-1"))
        var minted = 0
        s.onSessionEnded = { minted += 1 }
        s.bootstrap()
        XCTAssertEqual(s.state, .authenticated(userId: "u-1"))
        _ = try? await s.validAccessToken()
        XCTAssertEqual(s.state, .anonymous, "no half state")
        XCTAssertEqual(s.notice, .sessionExpired)
        XCTAssertNil(storage.load())
        XCTAssertEqual(minted, 1, "a fresh guest session is requested so chat keeps working")
        s.clearNotice()
        XCTAssertNil(s.notice)
    }

    func testGuestSessionEndingIsSilent() async {
        let (s, _) = store(TestFixtures.tokens(expiresIn: -10, sub: "g-1", anonymous: true))
        s.bootstrap()
        _ = try? await s.validAccessToken()
        XCTAssertEqual(s.state, .anonymous)
        XCTAssertNil(s.notice, "a guest is not told their (invisible) session ended")
    }

    func testSigningInClearsTheNotice() async {
        let (s, _) = store(TestFixtures.tokens(expiresIn: -10, sub: "u-1"))
        s.bootstrap()
        _ = try? await s.validAccessToken()
        XCTAssertEqual(s.notice, .sessionExpired)
        s.didAuthenticate(TestFixtures.tokens(expiresIn: 3600, sub: "u-1"), onboarded: true)
        XCTAssertNil(s.notice)
    }

    // MARK: Held chat message

    func testHeldMessageResumesOnlyAfterSignInOnASignInError() {
        let go = ChatViewModel.shouldResumeAfterLogin
        XCTAssertTrue(go(.authRequired, true, false, true))
        XCTAssertTrue(go(.anonLimitReached, true, false, true))
        XCTAssertFalse(go(.authRequired, true, false, false), "still a guest: nothing is sent")
        XCTAssertFalse(go(.generic, true, false, true), "other errors are not resent behind the person's back")
        XCTAssertFalse(go(.authRequired, false, false, true), "no held user message")
        XCTAssertFalse(go(.authRequired, true, true, true), "already streaming")
        XCTAssertFalse(go(nil, true, false, true))
    }
}
