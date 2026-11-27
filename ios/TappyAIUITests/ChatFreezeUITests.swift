import XCTest

/// Freeze hunt (owner diagnostics 27/11: after a reply the screen stops answering and the app has to be quit). Drives the REAL chat screen on the
/// simulator against the fixture backend's `chat: stream` mode (`ios/scripts/ui_stub_server.py`).
///
/// What the first two CI runs showed: the freeze reproduces with EVERY shape of reply (14 place cards, 3 cards, no chips, no cards at all — plain
/// prose and an article), not only with place cards; the main thread's call stack was inside `LazyStack.measureEstimates` (SwiftUI measuring the
/// lazy conversation list). So this run compares the two ways of holding the rows — lazy (the original) and eager (`-uitest-eager-list`) — over
/// three reply shapes. If eager passes where lazy fails, the lazy list is the cause.
///
/// After each reply the test checks that the app still answers (a plain query and one swipe, each with a deadline) and fails with a clear message
/// when it does not. The workflow `ios-freeze-hunt.yml` runs each test in its own xcodebuild and prints the app's own diagnostics (with the main
/// thread's call stack when it stalls).
final class ChatFreezeUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testLazyPlain() { scenario(shape: "none", kind: "plain", eager: false) }
    func testLazyArticle() { scenario(shape: "none", kind: "article", eager: false) }
    func testLazyFull() { scenario(shape: "full", kind: "plain", eager: false) }
    func testEagerPlain() { scenario(shape: "none", kind: "plain", eager: true) }
    func testEagerArticle() { scenario(shape: "none", kind: "article", eager: true) }
    func testEagerFull() { scenario(shape: "full", kind: "plain", eager: true) }

    private func scenario(shape: String, kind: String, eager: Bool) {
        let tag = "[\(eager ? "eager" : "lazy")/\(shape)/\(kind)]"
        setStub(["chat": "stream", "shape": shape, "kind": kind])
        defer { setStub(["chat": "off", "shape": "full", "kind": "alt"]) }
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-route", "chat", "-uitest-lang", "vi", "-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN",
                               "-uitest-theme", "dark"] + (eager ? ["-uitest-eager-list"] : [])
        app.launch()
        let input = any(app, "chat-input")
        XCTAssertTrue(input.waitForExistence(timeout: 60), "\(tag) the chat opens")

        for turn in 1...2 {
            input.tap()
            input.typeText("Cau hoi so \(turn)")
            any(app, "chat-send").tap()
            // The reply streams for about three seconds, and its drawing follows. Give it time, then ask the app something simple.
            Thread.sleep(forTimeInterval: 9)
            let asked = Date()
            let alive = input.waitForExistence(timeout: 25)
            let took = Date().timeIntervalSince(asked)
            XCTAssertTrue(alive, "\(tag) turn \(turn): the screen no longer answers (a plain query timed out after \(took) s) — FROZEN")
            XCTAssertEqual(app.state, .runningForeground, "\(tag) turn \(turn): the app is no longer running (crash)")
            let swipeStart = Date()
            app.swipeUp()
            let swipeTook = Date().timeIntervalSince(swipeStart)
            XCTAssertLessThan(swipeTook, 20, "\(tag) turn \(turn): a swipe took \(swipeTook) s — the main thread is stuck or very slow")
            attach("\(tag)-turn-\(turn)")
        }
    }

    // MARK: - Helpers (the same ones ScreenshotTests uses)

    private func any(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func attach(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func setStub(_ mode: [String: Any]) {
        guard let url = URL(string: "http://127.0.0.1:3000/__stub/mode"),
              let body = try? JSONSerialization.data(withJSONObject: mode) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let done = expectation(description: "stub mode")
        URLSession.shared.dataTask(with: request) { _, _, _ in done.fulfill() }.resume()
        wait(for: [done], timeout: 45)
    }
}
