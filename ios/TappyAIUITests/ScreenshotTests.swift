import XCTest

/// Evidence run: every test opens ONE real screen against the fixture backend
/// (`ios/scripts/ui_stub_server.py`, started by the CI job) and attaches a full-screen screenshot.
/// CI exports the attachments (`xcresulttool export attachments`) and pairs each with the matching
/// Android screenshot. A screen counts as PASS only when its screenshot exists — every test
/// asserts something visible first, so a blank or error screen fails instead of being photographed.
///
/// Launch hooks (DEBUG builds only): `-uitest-route`, `-uitest-lang` — see `App/UITestLaunch.swift`.
final class ScreenshotTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        setStub(["saved": "full", "config": "ok"])
    }

    // MARK: - Config failures (TestFlight build 50, 30/09)

    /// `/api/config` unreachable: login shows the friendly error with a retry, and retry recovers
    /// once the server answers — the screen never stays stuck.
    func testConfigDownShowsRetryAndRecovers() {
        setStub(["config": "down"])
        let app = launch(route: "hub")
        let signIn = any(app, "profile-guest-signin")
        XCTAssertTrue(signIn.waitForExistence(timeout: 30))
        signIn.tap()
        let retry = any(app, "error-retry")
        XCTAssertTrue(retry.waitForExistence(timeout: 60), "friendly error with a retry button")
        shot("14-config-down")
        setStub(["config": "ok"])
        retry.tap()
        XCTAssertTrue(any(app, "auth-guest").waitForExistence(timeout: 60), "retry reaches the login options")
    }

    /// The exact body production (f42ae4b) serves — old field names — must still open login.
    func testProductionConfigShapeOpensLogin() {
        setStub(["config": "prod"])
        let app = launch(route: "hub")
        let signIn = any(app, "profile-guest-signin")
        XCTAssertTrue(signIn.waitForExistence(timeout: 30))
        signIn.tap()
        XCTAssertTrue(any(app, "auth-guest").waitForExistence(timeout: 60), "login options from production config")
        shot("15-login-prod-config")
    }

    // MARK: - Signed-in hub (fixture account)

    func testHubSignedIn() {
        let app = launch(route: "hub", signedIn: true)
        XCTAssertTrue(any(app, "profile-hero").waitForExistence(timeout: 30), "hero")
        XCTAssertTrue(any(app, "profile-tab-posts").waitForExistence(timeout: 30), "content tabs")
        shot("16-hub-signed-in")
        any(app, "profile-tab-restricted").tap()
        shot("17-hub-restricted")
    }

    // MARK: - Screens

    /// Login: Google · Zalo · or · Email · Password · Sign in · Create account · Guest.
    func testLoginScreen() {
        let app = launch(route: "hub")
        let signIn = any(app, "profile-guest-signin")
        XCTAssertTrue(signIn.waitForExistence(timeout: 30), "guest card on the hub")
        signIn.tap()
        XCTAssertTrue(any(app, "auth-guest").waitForExistence(timeout: 30), "guest option on login")
        XCTAssertTrue(app.secureTextFields.firstMatch.exists, "password field on login")
        shot("01-login")
    }

    /// The 18+ gate as its own screen, opened by the server's `age_declaration_required`.
    func testAgeGate() {
        let app = launch(route: "chat")
        let input = any(app, "chat-input")
        XCTAssertTrue(input.waitForExistence(timeout: 30), "chat input")
        input.tap()
        input.typeText("xin chao")
        let send = any(app, "chat-send")
        XCTAssertTrue(send.waitForExistence(timeout: 10), "send button")
        send.tap()
        XCTAssertTrue(any(app, "age-submit").waitForExistence(timeout: 40), "full-screen 18+ gate")
        shot("02-age-gate")
    }

    /// Hub "Tôi" as a guest: sign-in card, nine locked rows.
    func testHubGuest() {
        let app = launch(route: "hub")
        XCTAssertTrue(any(app, "profile-guest-signin").waitForExistence(timeout: 30))
        shot("03-hub-guest")
    }

    func testSavedWithItems() {
        let app = launch(route: "saved")
        XCTAssertTrue(app.descendants(matching: .any)["saved-hero"].waitForExistence(timeout: 20))
        XCTAssertTrue(any(app, "saved-count-places").waitForExistence(timeout: 30), "count cards")
        shot("04-saved")
    }

    func testSavedEmpty() {
        setStub(["saved": "empty"])
        let app = launch(route: "saved")
        XCTAssertTrue(app.descendants(matching: .any)["saved-empty"].waitForExistence(timeout: 20), "empty card")
        shot("05-saved-empty")
    }

    func testSavedPlacesFilter() {
        let app = launch(route: "saved")
        let chip = any(app, "saved-chip-places")
        XCTAssertTrue(chip.waitForExistence(timeout: 30))
        chip.tap()
        XCTAssertTrue(app.staticTexts["Phở Thìn Bờ Hồ"].waitForExistence(timeout: 20), "saved place row")
        shot("06-saved-places")
    }

    func testVietContent() {
        let app = launch(route: "viet")
        XCTAssertTrue(app.descendants(matching: .any)["vc-hero"].waitForExistence(timeout: 20))
        app.buttons["vc-try-example"].tap()
        shot("07-viet-content")
    }

    func testRecommendations() {
        let app = launch(route: "recs")
        XCTAssertTrue(app.descendants(matching: .any)["recs-hero"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["recs-ask-0"].waitForExistence(timeout: 20), "recommendation card")
        shot("08-recommendations")
    }

    // MARK: - Share cards (the exact file "Lưu về máy" / TikTok / the share sheet send)

    func testShareCardReview() { cardShot(route: "card-review", name: "09-card-review") }
    func testShareCardClip() { cardShot(route: "card-clip", name: "10-card-clip") }
    func testShareCardSuggestion() { cardShot(route: "card-suggestion", name: "11-card-suggestion") }
    func testShareCardPlan() { cardShot(route: "card-plan", name: "12-card-plan") }
    func testShareCardQR() { cardShot(route: "card-qr", name: "13-card-qr") }

    private func cardShot(route: String, name: String) {
        let app = launch(route: route)
        XCTAssertTrue(any(app, "card-preview").waitForExistence(timeout: 60), "\(route): rendered card")
        shot(name)
    }

    // MARK: - Helpers

    /// Any element type with this accessibility identifier (SwiftUI does not always surface a
    /// styled Button as `.button`).
    private func any(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func launch(route: String, signedIn: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-route", route, "-uitest-lang", "vi",
                               "-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"]
            + (signedIn ? ["-uitest-signed-in"] : [])
        app.launch()
        return app
    }

    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Switches the fixture server's state (it is a separate process on the CI host).
    private func setStub(_ mode: [String: String]) {
        guard let url = URL(string: "http://127.0.0.1:3000/__stub/mode"),
              let body = try? JSONSerialization.data(withJSONObject: mode) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let done = expectation(description: "stub mode")
        URLSession.shared.dataTask(with: request) { _, _, _ in done.fulfill() }.resume()
        wait(for: [done], timeout: 10)
    }
}
