import XCTest

/// Freeze hunt (owner diagnostics 27/11: after a reply the screen stops answering and the app has to be quit). Drives the REAL chat screen on the
/// simulator against the fixture backend's `chat: stream` mode (`ios/scripts/ui_stub_server.py`). The first CI run REPRODUCED the freeze with the
/// full shape (14 place cards with chips, then prose): the main thread stalled four seconds after the first reply finished. So each test here is
/// one SHAPE of reply, to find which part of it freezes the screen:
///   full       — 14 places (3 shown + «Xem thêm»), chips on every card, prose
///   places3    — 3 places with chips, prose
///   noactions  — 14 places WITHOUT chips, prose
///   none       — no places at all, prose
///   article    — no places, an article (headings, list, table)
/// After each reply the test checks that the app still answers (a plain query and one swipe, each with a short deadline) and fails with a clear
/// message when it does not. The workflow `ios-freeze-hunt.yml` prints the app's own diagnostics (with the main thread's call stack when it stalls).
final class ChatFreezeUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testShapeFull() { scenario(shape: "full", kind: "plain") }
    func testShapePlaces3() { scenario(shape: "places3", kind: "plain") }
    func testShapeNoActions() { scenario(shape: "noactions", kind: "plain") }
    func testShapeNoPlaces() { scenario(shape: "none", kind: "plain") }
    func testShapeArticle() { scenario(shape: "none", kind: "article") }

    private func scenario(shape: String, kind: String) {
        setStub(["chat": "stream", "shape": shape, "kind": kind])
        defer { setStub(["chat": "off", "shape": "full", "kind": "alt"]) }
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-route", "chat", "-uitest-lang", "vi", "-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN",
                               "-uitest-theme", "dark"]
        app.launch()
        let input = any(app, "chat-input")
        XCTAssertTrue(input.waitForExistence(timeout: 60), "[\(shape)/\(kind)] the chat opens")

        for turn in 1...2 {
            input.tap()
            input.typeText("Cau hoi so \(turn)")
            any(app, "chat-send").tap()
            // The reply streams for about three seconds, and its drawing follows. Give it time, then ask the app something simple.
            Thread.sleep(forTimeInterval: 9)
            let asked = Date()
            let alive = input.waitForExistence(timeout: 25)
            let took = Date().timeIntervalSince(asked)
            XCTAssertTrue(alive, "[\(shape)/\(kind)] turn \(turn): the screen no longer answers (a plain query timed out after \(took) s) — FROZEN")
            XCTAssertEqual(app.state, .runningForeground, "[\(shape)/\(kind)] turn \(turn): the app is no longer running (crash)")
            let swipeStart = Date()
            app.swipeUp()
            let swipeTook = Date().timeIntervalSince(swipeStart)
            XCTAssertLessThan(swipeTook, 20, "[\(shape)/\(kind)] turn \(turn): a swipe took \(swipeTook) s — the main thread is stuck or very slow")
            attach("\(shape)-\(kind)-turn-\(turn)")
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
