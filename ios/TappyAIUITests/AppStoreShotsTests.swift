import XCTest

/// App Store screenshots: the REAL app screens against the fixture backend (`scripts/ui_stub_server.py`), full-screen,
/// with a clean status bar (set by the workflow with `simctl status_bar`). No person's data: the accounts, posts and
/// places are fixtures. The cards are drawn by the real chat screen from saved conversations (the way a reopened chat
/// draws them), not by a mock-up.
///
/// Run only by `.github/workflows/ios-appstore-shots.yml` on a simulator whose screenshots are 1242x2688 or 1284x2778
/// (the sizes App Store Connect accepts for the 6.5" slot). Attachment names `NN-name` are exported as `NN-name.png`.
final class AppStoreShotsTests: XCTestCase {

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        setStub(["saved": "full", "config": "ok", "zalo": "nostate", "selfdelete": "off", "apple": "off",
                 "p8": "off", "history": "on", "blocked": [String]()])
    }

    func testAppStoreShots() {
        // 1 — chat with the new ask card (a saved chat; the last assistant message carries the ask).
        var app = launch(route: "conv-ask", signedIn: true)
        XCTAssertTrue(any(app, "ask-send").waitForExistence(timeout: 60), "ask card in the chat")
        settle(); shot("01-chat-ask")
        app.terminate()

        // 2 — chat with a plan card.
        app = launch(route: "conv-plan", signedIn: true)
        XCTAssertTrue(any(app, "plan-share").waitForExistence(timeout: 60), "plan card in the chat")
        settle(); shot("02-chat-plan")
        app.terminate()

        // 3 — chat with the place cards (chips, paged cards, the four actions).
        app = launch(route: "conv-store", signedIn: true)
        XCTAssertTrue(app.staticTexts["Bún Bò Huế Đông Ba"].waitForExistence(timeout: 60), "place card in the chat")
        settle(); shot("03-chat-places")
        app.terminate()

        // 4 — Home.
        app = launch(route: "home", signedIn: true)
        XCTAssertTrue(any(app, "home-welcome").waitForExistence(timeout: 60), "home hero")
        settle(); shot("04-home")
        app.terminate()

        // 5 — Khám phá (clip feed).
        app = launch(route: "explore", signedIn: true)
        let row = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS 'Minh Anh' OR label CONTAINS 'Quốc Bảo'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 60), "a feed row")
        Thread.sleep(forTimeInterval: 3)   // the drawn fixture picture is fetched from the stub
        settle(); shot("05-explore")
        app.terminate()

        // 6 — Scam Shield: a pasted message read against the Ministry's 25 scenarios (on the phone).
        app = launch(route: "scam", signedIn: true, extra: ["-uitest-scam-message",
                     "Bưu phẩm Trung thu của bạn đang bị giữ. Vui lòng quét mã QR để thanh toán phí 15.000đ và nhận hàng."])
        XCTAssertTrue(any(app, "scam-msg-matched").waitForExistence(timeout: 60), "scam message result")
        app.swipeUp()   // once: the result's title stays in view
        settle(); shot("06-scam-message")
        app.terminate()

        // 7 — Scam Shield: a QR code that holds a link, checked.
        app = launch(route: "scam", signedIn: true, extra: ["-uitest-scam-qr", "https://phat-nguoi-gov.xyz/nop"])
        XCTAssertTrue(any(app, "scam-link-dontopen").waitForExistence(timeout: 60), "qr link result")
        settle(); shot("07-scam-qr")
        app.terminate()

        // 8 — «Tôi» (profile hub).
        app = launch(route: "hub", signedIn: true)
        XCTAssertTrue(any(app, "profile-tab-posts").waitForExistence(timeout: 60), "profile hub")
        settle(); shot("08-profile")
        app.terminate()

        // 9 — the one-time «share data with AI» sheet, before the first message goes anywhere.
        app = launch(route: "chat", signedIn: false, extra: ["-uitest-ai-consent-prompt"])
        let input = any(app, "chat-input")
        XCTAssertTrue(input.waitForExistence(timeout: 60), "chat input")
        input.tap()
        input.typeText("Quan an ngon quanh day")
        any(app, "chat-send").tap()
        XCTAssertTrue(any(app, "ai-consent-agree").waitForExistence(timeout: 30), "the AI consent sheet")
        settle(); shot("09-ai-consent")
        app.terminate()

        // 10 — Settings.
        app = launch(route: "settings", signedIn: true)
        XCTAssertTrue(any(app, "settings-delete").waitForExistence(timeout: 60) || app.staticTexts["Cài đặt"].waitForExistence(timeout: 5), "settings")
        settle(); shot("10-settings")
    }

    // MARK: - helpers

    /// Lets the screen settle and dismisses the system's location prompt (the simulator's privacy grant can lose the race
    /// with the first launch). The prompt is the system's own, in the simulator's language.
    private func settle() {
        Thread.sleep(forTimeInterval: 1.5)
        dismissSystemAlerts()
        Thread.sleep(forTimeInterval: 1.0)
    }

    private func dismissSystemAlerts() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Allow While Using App", "Allow Once", "Cho phép khi dùng ứng dụng", "OK"] {
            let button = springboard.alerts.buttons[label]
            if button.waitForExistence(timeout: 2) { button.tap(); return }
        }
    }

    private func any(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func launch(route: String, signedIn: Bool = false, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-route", route, "-uitest-lang", "vi", "-uitest-theme", "dark",
                               "-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-uitest-appstore"]
            + (signedIn ? ["-uitest-signed-in"] : []) + extra
        app.launch()
        return app
    }

    private func shot(_ name: String) {
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
