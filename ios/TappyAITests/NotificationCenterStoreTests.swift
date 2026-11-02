import XCTest
@testable import TappyAI

/// What the stub inbox answers: a number the test can change while the store runs.
private final class UnreadBox: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Int
    init(_ value: Int) { current = value }
    var value: Int {
        get { lock.lock(); defer { lock.unlock() }; return current }
        set { lock.lock(); current = newValue; lock.unlock() }
    }
}

private func inboxJSON(unread: Int) -> Data {
    Data(#"{"notifications":[],"unreadCount":\#(unread)}"#.utf8)
}

/// The tab-bar unread count (ADR-014): app-level, only for a signed-in person, and never an answer that belongs to someone else.
@MainActor
final class NotificationCenterStoreTests: XCTestCase {
    private func signedInSession(sub: String = "user-1") -> SessionStore {
        let s = SessionStore(storage: InMemoryTokenStorage(TestFixtures.tokens(expiresIn: 3600, sub: sub)))
        s.bootstrap()
        return s
    }

    private func makeStore(_ api: APIClient, _ session: SessionStore) -> NotificationCenterStore {
        NotificationCenterStore(service: NotificationsService(api: api), supabase: nil, session: session)
    }

    func testASignedInPersonSeesTheServersUnreadCountFromAOneRowRequest() async {
        let api = ChatTestAPI { _ in inboxJSON(unread: 4) }
        let store = makeStore(api, signedInSession())
        await store.refresh()
        XCTAssertEqual(store.unreadCount, 4)
        let sent = api.sentEndpoints
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent.first?.path, "/api/notifications")
        XCTAssertEqual(sent.first?.query.first(where: { $0.name == "limit" })?.value, "1", "only the count is wanted")
    }

    func testAGuestReadsZeroAndAsksNothing() async {
        let api = ChatTestAPI { _ in inboxJSON(unread: 9) }
        let guest = SessionStore(storage: InMemoryTokenStorage(TestFixtures.tokens(expiresIn: 3600, anonymous: true)))
        guest.bootstrap()
        let store = makeStore(api, guest)
        await store.refresh()
        XCTAssertEqual(store.unreadCount, 0)
        XCTAssertEqual(api.sentEndpoints.count, 0, "a guest has no notifications to count")
    }

    func testReadingEverythingClearsTheBadgeAtOnceAndTheNextRefreshReconciles() async {
        let unread = UnreadBox(3)
        let api = ChatTestAPI { _ in inboxJSON(unread: unread.value) }
        let store = makeStore(api, signedInSession())
        await store.refresh()
        XCTAssertEqual(store.unreadCount, 3)
        store.markAllReadLocally()
        XCTAssertEqual(store.unreadCount, 0)
        unread.value = 2   // two new ones arrived meanwhile
        await store.refresh()
        XCTAssertEqual(store.unreadCount, 2)
    }

    func testSigningOutDropsTheCountToZero() async {
        let api = ChatTestAPI { _ in inboxJSON(unread: 5) }
        let session = signedInSession()
        let store = makeStore(api, session)
        await store.sessionChanged()
        XCTAssertEqual(store.unreadCount, 5)
        session.logout()
        await store.sessionChanged()
        XCTAssertEqual(store.unreadCount, 0)
    }

    func testAnAnswerThatArrivesAfterSigningOutIsNotShown() async {
        let gate = TestGate()
        let api = ChatTestAPI { _ in
            await gate.wait()
            return inboxJSON(unread: 7)
        }
        let session = signedInSession()
        let store = makeStore(api, session)
        let pending = Task { await store.refresh() }
        await waitUntil { api.sentEndpoints.count == 1 }
        session.logout()
        await gate.open()
        await pending.value
        XCTAssertEqual(store.unreadCount, 0, "the request was made for the person who has since signed out")
    }
}
