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
}
