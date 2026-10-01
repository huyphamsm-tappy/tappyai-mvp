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
        // Every test starts from production's shape: no safety block, no in-app deletion, no Apple button.
        setStub(["saved": "full", "config": "ok", "zalo": "nostate", "selfdelete": "off", "apple": "off",
                 "p8": "off", "blocked": [String]()])
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

    // MARK: - Settings = Android's (L11), Music hidden

    func testSettingsMirrorsAndroid() {
        let app = launch(route: "settings", signedIn: true, extra: ["-uitest-theme", "dark"])
        XCTAssertTrue(any(app, "settings-notifications").waitForExistence(timeout: 30), "Options card")
        shot("33-settings")   // the TOP: subtitle + Options card (the bottom is 35)
        for id in ["memory", "language", "appearance", "guide", "terms", "privacy", "copyright", "delete", "signout"] {
            XCTAssertTrue(scrollTo(app, "settings-" + id), "row \(id)")
        }
        XCTAssertFalse(any(app, "settings-signin").exists, "a signed-in user is offered sign-out, not sign-in")
        let music = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'nhạc' OR label CONTAINS[c] 'music'"))
        XCTAssertEqual(music.count, 0, "no music row anywhere in Settings")
        XCTAssertFalse(any(app, "settings-blocked").exists, "no blocked-accounts row while the server safety flags are off")
        shot("35-settings-bottom")
        // The appearance picker changes the value shown on its row.
        app.swipeDown(); app.swipeDown()
        any(app, "settings-appearance").tap()
        let light = app.buttons["Sáng"]
        XCTAssertTrue(light.waitForExistence(timeout: 10), "appearance choices")
        light.tap()
        let row = any(app, "settings-appearance")
        expectation(for: NSPredicate(format: "label CONTAINS 'Sáng'"), evaluatedWith: row)   // case-sensitive: the description says "sáng"
        waitForExpectations(timeout: 10)
    }

    func testSettingsAsGuestOffersSignIn() {
        let app = launch(route: "settings")
        XCTAssertTrue(any(app, "settings-notifications").waitForExistence(timeout: 30), "Options card")
        shot("36-settings-guest-top")
        XCTAssertTrue(scrollTo(app, "settings-signin"), "guest sign-in card")
        XCTAssertFalse(any(app, "settings-signout").exists, "a guest is not offered sign-out")
        shot("34-settings-guest")
        any(app, "settings-signin").tap()
        XCTAssertTrue(any(app, "auth-guest").waitForExistence(timeout: 30), "opens the login")
    }

    // MARK: - A1 Safety: report / block (App Store 1.2) — the server's Phase 8 flags are ON in the fixture

    func testSafetyReportAndBlockFromAProfile() {
        setStub(["p8": "on"])
        let app = launch(route: "safety-user", signedIn: true, extra: ["-uitest-theme", "dark"])
        let menu = any(app, "profile-safety")
        XCTAssertTrue(menu.waitForExistence(timeout: 40), "⋯ on someone else's profile")
        menu.tap()
        XCTAssertTrue(any(app, "safety-reason-spam").waitForExistence(timeout: 20), "reason list")
        XCTAssertFalse(any(app, "safety-submit").isEnabled, "nothing can be sent before a reason is chosen")
        shot("37-safety-user")
        any(app, "safety-reason-scam").tap()
        XCTAssertTrue(any(app, "safety-submit").isEnabled)
        any(app, "safety-submit").tap()
        XCTAssertTrue(any(app, "safety-sent").waitForExistence(timeout: 20), "thanks card")
        shot("38-safety-user-sent")
        any(app, "safety-block").tap()
        let confirm = app.alerts.buttons["Chặn"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10), "block confirmation")
        shot("39-safety-block-confirm")
        confirm.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: any(app, "safety-block"))
        waitForExpectations(timeout: 20)   // the sheet closes once the block took effect
    }

    func testSafetyReportFromAPostAndItsComments() {
        setStub(["p8": "on"])
        let app = launch(route: "safety-review", signedIn: true, extra: ["-uitest-theme", "dark"])
        let menu = any(app, "review-safety")
        XCTAssertTrue(menu.waitForExistence(timeout: 40), "⋯ on someone else's post")
        menu.tap()
        XCTAssertTrue(any(app, "safety-reason-harassment").waitForExistence(timeout: 20))
        any(app, "safety-close").tap()
        let comments = any(app, "review-comments")
        XCTAssertTrue(scrollTo(app, "review-comments"))
        comments.tap()
        let commentMenu = any(app, "comment-safety-c1")
        XCTAssertTrue(commentMenu.waitForExistence(timeout: 20), "⋯ on someone else's comment")
        shot("42-safety-comments")
        commentMenu.tap()
        XCTAssertTrue(any(app, "safety-reason-hate").waitForExistence(timeout: 20), "comment report sheet")
        shot("43-safety-comment-sheet")
    }

    func testBlockedAccountsListAndUnblock() {
        setStub(["p8": "on", "blocked": ["u9"]])
        let app = launch(route: "settings", signedIn: true, extra: ["-uitest-theme", "dark"])
        let row = any(app, "settings-blocked")
        XCTAssertTrue(row.waitForExistence(timeout: 40), "Settings lists «Tài khoản đã chặn» while blocking is on")
        row.tap()
        let name = any(app, "blocked-name-u9")
        XCTAssertTrue(name.waitForExistence(timeout: 30), "the blocked person is listed")
        expectation(for: NSPredicate(format: "label == 'Quốc Bảo'"), evaluatedWith: name)   // name from the public profile
        waitForExpectations(timeout: 20)
        shot("40-blocked-list")
        any(app, "blocked-unblock-u9").tap()
        XCTAssertTrue(any(app, "blocked-empty").waitForExistence(timeout: 20), "empty state after unblocking")
        shot("41-blocked-empty")
    }

    // MARK: - A2 In-app account deletion (App Store 5.1.1(v)) — both states of the server flag

    /// Flag OFF (production today): the row is the email request, and the app says so.
    func testAccountDeletionWhenTheServerFlagIsOff() {
        let app = launch(route: "settings", signedIn: true, extra: ["-uitest-theme", "dark"])
        XCTAssertTrue(scrollTo(app, "settings-delete"), "delete row")
        any(app, "settings-delete").tap()
        let title = app.alerts.firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10), "explanation alert")
        XCTAssertTrue(title.label.contains("Yêu cầu xoá tài khoản"), "says it is a REQUEST, got: \(title.label)")
        shot("44-delete-flag-off")
    }

    /// Flag ON: the full in-app flow — list of what is removed → type the word → final confirm → done → signed out.
    func testAccountDeletionInAppWhenTheServerFlagIsOn() {
        setStub(["selfdelete": "on"])
        let app = launch(route: "settings", signedIn: true, extra: ["-uitest-theme", "dark"])
        // The row becomes «Xóa tài khoản» once /api/config says the server supports it.
        expectation(for: NSPredicate(format: "label CONTAINS 'Xóa vĩnh viễn'"), evaluatedWith: any(app, "settings-delete"))
        XCTAssertTrue(scrollTo(app, "settings-delete"))
        waitForExpectations(timeout: 40)
        any(app, "settings-delete").tap()
        let word = any(app, "delete-word")
        XCTAssertTrue(word.waitForExistence(timeout: 20), "the confirmation form")
        XCTAssertFalse(any(app, "delete-submit").isEnabled, "disabled until the word is typed")
        shot("45-delete-form")
        // The field sits at the very bottom edge; bring it up before tapping so it takes keyboard focus.
        for _ in 0..<4 where word.frame.maxY > app.frame.height - 120 { app.swipeUp() }
        word.tap()
        if !app.keyboards.firstMatch.waitForExistence(timeout: 5) { word.tap() }
        word.typeText("XÓA")
        let enabled = NSPredicate(format: "isEnabled == true")
        let wait = XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: enabled, object: any(app, "delete-submit"))], timeout: 10)
        shot("55-delete-typed")
        XCTAssertEqual(wait, .completed, "submit enabled after typing; field value: \(String(describing: word.value))")
        any(app, "delete-submit").tap()
        let final = app.alerts.buttons["Xóa vĩnh viễn tài khoản"]
        XCTAssertTrue(final.waitForExistence(timeout: 10), "final confirmation")
        final.tap()
        XCTAssertTrue(any(app, "delete-done-home").waitForExistence(timeout: 30), "done screen")
        shot("46-delete-done")
    }

    // MARK: - A3 Sign in with Apple — visible only when the server enables it

    func testSignInWithAppleButtonAppearsWhenEnabled() {
        setStub(["apple": "on"])
        let app = launch(route: "hub", extra: ["-uitest-theme", "dark"])
        let signIn = any(app, "profile-guest-signin")
        XCTAssertTrue(signIn.waitForExistence(timeout: 30))
        signIn.tap()
        XCTAssertTrue(any(app, "auth-apple").waitForExistence(timeout: 60), "Sign in with Apple button")
        shot("47-login-apple")
    }

    func testSignInWithAppleButtonIsHiddenByDefault() {
        let app = launch(route: "hub")
        let signIn = any(app, "profile-guest-signin")
        XCTAssertTrue(signIn.waitForExistence(timeout: 30))
        signIn.tap()
        XCTAssertTrue(any(app, "auth-guest").waitForExistence(timeout: 60))
        XCTAssertFalse(any(app, "auth-apple").exists, "hidden until the provider is enabled")
    }

    // MARK: - Ask card v2 (R23 + R23.1), all 5 areas beside docs/design/ask-card/ask-card-mockup.png

    func testAskCardEntertainmentSelectsAndSends() {
        let app = launch(route: "ask-entertainment")
        XCTAssertTrue(any(app, "ask-send").waitForExistence(timeout: 30), "ask card")
        for label in ["Karaoke", "Bida/bowling", "1 mình", "2 người", "Tối nay"] { option(app, label).tap() }
        shot("28-ask-entertainment")
        any(app, "ask-send").tap()
        let sent = any(app, "ask-sent")
        XCTAssertTrue(sent.waitForExistence(timeout: 10))
        XCTAssertEqual(sent.label, "Karaoke, Bida/bowling · 2 người · Tối nay", "type takes several, the others one")
        any(app, "ask-send").tap()
        XCTAssertEqual(sent.label, "Karaoke, Bida/bowling · 2 người · Tối nay", "the card locks after one send")
    }

    func testAskCardFood() { askShot("food", "29-ask-food", picks: ["Món Việt", "Ăn tại quán"]) }
    func testAskCardShopping() { askShot("shopping", "30-ask-shopping", picks: ["Nhét tai", "1-3tr"]) }
    func testAskCardTravel() { askShot("travel", "31-ask-travel", picks: ["3N2Đ", "Biển", "Núi"]) }
    func testAskCardSpa() { askShot("spa", "32-ask-spa", picks: ["Massage", "Tối nay"]) }

    // MARK: - B1 Plan card v2 (docs/design/share-layouts/plan-share.png), all 5 areas

    /// Travel carries stored image KEYS; the fixture manifest serves them, so the card shows images
    /// (fixture gradients, standing in for the photo library) — and a key it cannot serve stays a placeholder.
    func testPlanCardTravelResolvesStoredImageKeys() {
        let app = launch(route: "plan-travel", extra: ["-uitest-theme", "dark"])
        XCTAssertTrue(any(app, "plan-share").waitForExistence(timeout: 40), "plan card")
        XCTAssertTrue(any(app, "plan-title").exists)
        XCTAssertEqual(any(app, "plan-title").label, "Quy Nhơn")
        XCTAssertTrue(any(app, "plan-price").exists, "a stop with the server's amount")
        XCTAssertTrue(any(app, "plan-no-price").exists, "«chưa có giá — hỏi quán» for a stop without an amount")
        XCTAssertEqual(any(app, "plan-no-price").label, "chưa có giá — hỏi quán")
        shot("48-plan-travel")
        XCTAssertTrue(scrollTo(app, "plan-overview"), "«Tổng quan chuyến đi»")
        XCTAssertTrue(scrollTo(app, "plan-highlights"), "«Điểm nổi bật»")
        XCTAssertTrue(scrollTo(app, "plan-full-cta"), "«Xem kế hoạch đầy đủ trên Tappy»")
        shot("49-plan-travel-bottom")
    }

    func testPlanCardFood() { planShot("food", "50-plan-food") }
    func testPlanCardEntertainment() { planShot("entertainment", "51-plan-entertainment") }
    func testPlanCardShopping() { planShot("shopping", "52-plan-shopping") }
    func testPlanCardSpa() { planShot("spa", "53-plan-spa") }

    /// No image keys in the plan: every slot is the area's placeholder (gradient + emoji), never another picture.
    private func planShot(_ area: String, _ name: String) {
        let app = launch(route: "plan-" + area, extra: ["-uitest-theme", "dark"])
        XCTAssertTrue(any(app, "plan-share").waitForExistence(timeout: 40), "plan card")
        XCTAssertTrue(any(app, "plan-image-placeholder").exists, "placeholder where there is no stored key")
        shot(name)
    }

    // MARK: - B4 main-flow screens that had no CI picture

    /// Khám phá: the clip feed. Fixture rows come from the stub's trending feed.
    func testExploreFeed() {
        let app = launch(route: "explore", signedIn: true, extra: ["-uitest-theme", "dark"])
        let row = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS 'Quốc Bảo' OR label CONTAINS 'Minh Anh' OR label CONTAINS 'Phở Thìn'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 60), "a feed row")
        shot("59-explore")
    }

    /// A post's detail page with the safety flags OFF: no ⋯ button, so the screen is the pre-Phase-8 one.
    func testReviewDetailWithoutSafety() {
        let app = launch(route: "safety-review", signedIn: true, extra: ["-uitest-theme", "dark"])
        XCTAssertTrue(any(app, "review-comments").waitForExistence(timeout: 60), "detail loaded")
        XCTAssertFalse(any(app, "review-safety").exists, "no report button while the server flags are off")
        shot("60-review-detail")
    }

    // MARK: - B2 place decision (chips, paged cards, fold, Maps footer, the four actions)

    func testPlaceDecision() {
        let app = launch(route: "places", extra: ["-uitest-theme", "dark"])
        XCTAssertTrue(any(app, "place-filter-all").waitForExistence(timeout: 40), "chip row")
        XCTAssertEqual(any(app, "place-filter-all").label, "Tất cả (5)")
        XCTAssertTrue(any(app, "place-filter-open").exists, "open splits 3/5")
        XCTAssertTrue(any(app, "place-filter-rated").exists, "top-rated splits 2/5")
        XCTAssertTrue(any(app, "place-filter-wifi").exists, "wifi splits 2/5")
        XCTAssertFalse(any(app, "place-filter-outdoor").exists, "no row has outdoor seating: no chip")
        XCTAssertTrue(any(app, "place-show-more").exists, "five places, three above the fold")
        XCTAssertTrue(app.staticTexts["Bún chả Hương Liên"].exists)
        XCTAssertTrue(app.buttons["Xem bản đồ"].exists, "action: map")
        XCTAssertTrue(app.buttons["Website"].exists, "action: website")
        XCTAssertTrue(app.buttons["Tìm review trên Google"].exists, "action: find reviews")
        XCTAssertTrue(app.buttons["Gọi"].exists, "action: call")
        shot("56-places")

        any(app, "place-filter-open").tap()
        XCTAssertFalse(any(app, "place-show-more").exists, "a chip shows every admitted row, no fold")
        shot("57-places-open-chip")

        any(app, "place-filter-all").tap()
        XCTAssertTrue(scrollTo(app, "place-explore-map"), "«Xem tất cả trên bản đồ»")
        shot("58-places-footer")
    }

    func testAskCardEmptySendSearches() {
        let app = launch(route: "ask-food")
        XCTAssertTrue(any(app, "ask-send").waitForExistence(timeout: 30))
        any(app, "ask-send").tap()
        XCTAssertEqual(any(app, "ask-sent").label, "Tìm cho tôi")
    }

    private func askShot(_ area: String, _ name: String, picks: [String]) {
        let app = launch(route: "ask-" + area)
        XCTAssertTrue(any(app, "ask-send").waitForExistence(timeout: 30), "ask card")
        for label in picks { option(app, label).tap() }
        shot(name)
    }

    /// An option tile by its visible label (the hyphen is drawn non-breaking).
    private func option(_ app: XCUIApplication, _ label: String) -> XCUIElement {
        let shown = label.replacingOccurrences(of: "-", with: "\u{2011}")
        let el = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", shown)).firstMatch
        XCTAssertTrue(el.waitForExistence(timeout: 10), "option \(label)")
        return el
    }

    // MARK: - Home V3 (Android L12), dark like the Android reference

    func testHomeV3() {
        let app = launch(route: "home", signedIn: true, extra: ["-uitest-theme", "dark"])
        let welcome = any(app, "home-welcome")
        XCTAssertTrue(welcome.waitForExistence(timeout: 30), "hero")
        XCTAssertTrue(any(app, "home-ask").exists, "ask bar")
        XCTAssertTrue(any(app, "home-quick-cafe").exists, "quick suggestions")
        let named = NSPredicate(format: "label CONTAINS %@", "Minh Anh")
        expectation(for: named, evaluatedWith: welcome)
        waitForExpectations(timeout: 30)
        shot("23-home")
        app.swipeUp()
        shot("24-home-2")
        app.swipeUp()
        XCTAssertTrue(any(app, "home-deals-empty").waitForExistence(timeout: 20), "deals empty card")
        shot("25-home-3")
        XCTAssertTrue(scrollTo(app, "home-suggestion-1"), "suggestion cards")
        shot("26-home-4")
        XCTAssertTrue(scrollTo(app, "tool-scan"), "smart tools")
        shot("27-home-5")
    }

    /// Swipes up (at most 10 times) until `id` is on screen — the page is long and its grids are lazy.
    private func scrollTo(_ app: XCUIApplication, _ id: String) -> Bool {
        let el = any(app, id)
        for _ in 0..<10 {
            if el.exists && el.isHittable { return true }
            app.swipeUp()
        }
        return el.waitForExistence(timeout: 5) && el.isHittable
    }

    // MARK: - MOB-1: sign-in callbacks need the state this app made

    /// The fixture server plays the attacker: its `/api/auth/zalo` hands the app someone else's
    /// session with NO state. The app must refuse it and stay a guest.
    func testZaloCallbackWithoutStateIsRefused() {
        zaloAttack(mode: "nostate", shotName: "20-mob1-zalo-no-state")
    }

    /// Same, with a state the app never made.
    func testZaloCallbackWithForeignStateIsRefused() {
        zaloAttack(mode: "wrongstate", shotName: "21-mob1-zalo-wrong-state")
    }

    /// A sign-in callback opened from outside the app (message, Safari) changes nothing: the
    /// signed-in fixture account stays signed in and no sign-in screen appears.
    func testExternalSignInLinkIsIgnored() throws {
        let app = launch(route: "hub", signedIn: true)
        XCTAssertTrue(any(app, "profile-edit").waitForExistence(timeout: 30), "fixture account signed in")
        guard #available(iOS 16.4, *) else { throw XCTSkip("XCUIApplication.open(_:) needs iOS 16.4") }
        app.open(URL(string: "tappyai://auth/callback#access_token=eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdHRhY2tlciJ9.x&refresh_token=attacker&state=attacker")!)
        app.activate()
        XCTAssertTrue(any(app, "profile-edit").waitForExistence(timeout: 20), "still the same account")
        XCTAssertFalse(any(app, "auth-error").exists)
        shot("22-mob1-external-link")
    }

    private func zaloAttack(mode: String, shotName: String) {
        setStub(["zalo": mode])
        let app = launch(route: "hub")
        let signIn = any(app, "profile-guest-signin")
        XCTAssertTrue(signIn.waitForExistence(timeout: 30))
        signIn.tap()
        let zalo = any(app, "auth-zalo")
        XCTAssertTrue(zalo.waitForExistence(timeout: 60), "Zalo button on login")
        zalo.tap()
        confirmWebAuthPrompt()
        let error = any(app, "auth-error")
        XCTAssertTrue(error.waitForExistence(timeout: 60), "refusal shown")
        XCTAssertTrue(error.label.contains("không hợp lệ") || error.label.contains("is invalid"),
                      "the state-mismatch message, got: \(error.label)")
        XCTAssertTrue(any(app, "auth-guest").exists, "still on login as a guest — no session imported")
        shot(shotName)
    }

    /// ASWebAuthenticationSession's "wants to use … to sign in" alert belongs to SpringBoard.
    private func confirmWebAuthPrompt() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Tiếp tục", "Continue"] {
            let button = springboard.buttons[label]
            if button.waitForExistence(timeout: 10) { button.tap(); return }
        }
    }

    // MARK: - Signed-in hub (fixture account)

    func testHubSignedIn() {
        let app = launch(route: "hub", signedIn: true)
        XCTAssertTrue(any(app, "profile-edit").waitForExistence(timeout: 30), "hero with its Edit button")
        XCTAssertTrue(any(app, "profile-tab-posts").waitForExistence(timeout: 30), "content tabs")
        shot("16-hub-signed-in")
        any(app, "profile-tab-restricted").tap()
        shot("17-hub-restricted")
        // The side panels under the account rows: info, activity, following, QR.
        app.swipeUp(); app.swipeUp(); app.swipeUp()
        shot("19-hub-panels")
    }

    func testDealsAskCardWhenEmpty() {
        let app = launch(route: "deals")
        XCTAssertTrue(any(app, "deals-ask-tappy").waitForExistence(timeout: 30), "ask-Tappy card with no deals")
        shot("18-deals")
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

    private func launch(route: String, signedIn: Bool = false, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest-route", route, "-uitest-lang", "vi",
                               "-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"]
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

    /// Switches the fixture server's state (it is a separate process on the CI host).
    private func setStub(_ mode: [String: Any]) {
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
