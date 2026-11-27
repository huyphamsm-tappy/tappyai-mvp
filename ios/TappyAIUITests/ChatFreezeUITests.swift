import XCTest

/// Freeze hunt (owner diagnostics 27/11: after a reply the screen stops answering and the app has to be quit). Drives the REAL chat screen on the
/// simulator against the fixture backend's `chat: stream` mode (`ios/scripts/ui_stub_server.py`): replies shaped like the production ones that froze
/// (a ~12 KB annotation line, bold text and a link, then an article with headings, a list and a table). After EVERY reply the test checks that the
/// app still answers — the question box is usable again, a swipe returns quickly — and fails with a clear message when it does not.
/// The workflow `ios-freeze-hunt.yml` then prints the app's own diagnostics (`tappy-diagnostics.log`, which carries the main thread's call stack
/// when it stalls) and uploads it with the result bundle.
final class ChatFreezeUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testChatStaysResponsiveAfterEveryAnswer() {
        setStub(["chat": "stream"])
        defer { setStub(["chat": "off"]) }
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-route", "chat", "-uitest-lang", "vi", "-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN",
                               "-uitest-theme", "dark"]
        app.launch()
        let input = any(app, "chat-input")
        XCTAssertTrue(input.waitForExistence(timeout: 60), "the chat opens")

        for turn in 1...6 {
            let asked = Date()
            input.tap()
            input.typeText("Cau hoi so \(turn)")
            any(app, "chat-send").tap()

            // The reply streams for about three seconds; the box is disabled meanwhile. Wait until it is usable again.
            var usable = false
            while Date().timeIntervalSince(asked) < 90 {
                if Date().timeIntervalSince(asked) > 2.0, input.isEnabled { usable = true; break }
                Thread.sleep(forTimeInterval: 0.5)
            }
            attach(app, "turn-\(turn)-after-reply")
            XCTAssertTrue(usable, "turn \(turn): the question box did not become usable again within 90 s of sending — the screen is frozen or the turn never ended")
            XCTAssertEqual(app.state, .runningForeground, "turn \(turn): the app is no longer running (crash)")

            // The screen must answer touches quickly: scroll both ways, then the box again.
            let started = Date()
            app.swipeUp()
            app.swipeDown()
            let took = Date().timeIntervalSince(started)
            XCTAssertLessThan(took, 20, "turn \(turn): two swipes took \(took) s — the main thread is stuck or very slow after the reply")
            XCTAssertTrue(input.waitForExistence(timeout: 20), "turn \(turn): the question box is gone after the reply")
        }
    }

    // MARK: - Helpers (the same ones ScreenshotTests uses)

    private func any(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
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
