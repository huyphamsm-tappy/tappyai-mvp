import XCTest
@testable import TappyAI

@MainActor
final class SessionStoreTests: XCTestCase {

    func testBootstrapAnonymousWhenNoTokens() {
        let store = SessionStore(storage: InMemoryTokenStorage())
        store.bootstrap()
        XCTAssertEqual(store.state, .anonymous)
    }

    func testBootstrapAuthenticatedFromStoredTokens() {
        let storage = InMemoryTokenStorage(TestFixtures.tokens(expiresIn: 3600, sub: "u-42"))
        let store = SessionStore(storage: storage)
        store.bootstrap()
        XCTAssertEqual(store.state, .authenticated(userId: "u-42"))
    }

    func testLogoutClearsSession() {
        let storage = InMemoryTokenStorage(TestFixtures.tokens(expiresIn: 3600))
        let store = SessionStore(storage: storage)
        store.bootstrap()
        store.logout()
        XCTAssertEqual(store.state, .anonymous)
        XCTAssertNil(storage.load())
    }

    func testExpiringTokenTriggersSingleFlightRefresh() async throws {
        let refreshed = TestFixtures.tokens(expiresIn: 3600, sub: "u-1")
        let storage = InMemoryTokenStorage(TestFixtures.tokens(expiresIn: -10, sub: "u-1"))
        let store = SessionStore(storage: storage,
                                 refresher: MockTokenRefreshing(result: .success(refreshed)))
        store.bootstrap()
        let token = try await store.validAccessToken()
        XCTAssertEqual(token, refreshed.accessToken)
    }

    func testFailedRefreshLogsOut() async {
        let storage = InMemoryTokenStorage(TestFixtures.tokens(expiresIn: -10))
        let store = SessionStore(storage: storage,
                                 refresher: MockTokenRefreshing(result: .failure(AppError.authentication(reason: .refreshFailed))))
        store.bootstrap()
        _ = try? await store.validAccessToken()
        XCTAssertEqual(store.state, .anonymous)
    }

    // 03/11: only a refresh the server REFUSED ends a session; no signal must not throw a signed-in person out.
    func testOfflineRefreshKeepsTheSession() async {
        let storage = InMemoryTokenStorage(TestFixtures.tokens(expiresIn: -10, sub: "u-1"))
        let store = SessionStore(storage: storage,
                                 refresher: MockTokenRefreshing(result: .failure(URLError(.notConnectedToInternet))))
        store.bootstrap()
        _ = try? await store.validAccessToken()
        XCTAssertEqual(store.state, .authenticated(userId: "u-1"))
        XCTAssertNotNil(storage.load(), "the Keychain copy survives a bad moment of signal")
    }

    func testRefusedRefreshEndsTheSession() async {
        let storage = InMemoryTokenStorage(TestFixtures.tokens(expiresIn: -10, sub: "u-1"))
        let refused = NSError(domain: "auth", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid Refresh Token: Already Used"])
        let store = SessionStore(storage: storage, refresher: MockTokenRefreshing(result: .failure(refused)))
        store.bootstrap()
        _ = try? await store.validAccessToken()
        XCTAssertEqual(store.state, .anonymous)
    }

    func testRefreshClassification() {
        XCTAssertFalse(SessionStore.refreshEndsSession(URLError(.timedOut)))
        XCTAssertFalse(SessionStore.refreshEndsSession(CancellationError()))
        XCTAssertFalse(SessionStore.refreshEndsSession(AppError.offline))
        XCTAssertTrue(SessionStore.refreshEndsSession(AppError.authentication(reason: .refreshFailed)))
        XCTAssertFalse(SessionStore.refreshEndsSession(NSError(domain: "x", code: 1, userInfo: [NSLocalizedDescriptionKey: "server hiccup"])))
    }
}
