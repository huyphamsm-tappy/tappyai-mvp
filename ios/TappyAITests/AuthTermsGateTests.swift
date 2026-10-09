import XCTest
@testable import TappyAI

/// App Review 1.2: the Terms are agreed BEFORE registering or logging in, by any method.
final class AuthTermsGateTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "AuthTermsGateTests")
        defaults.removePersistentDomain(forName: "AuthTermsGateTests")
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: "AuthTermsGateTests")
        super.tearDown()
    }

    private func consent() -> TermsConsent { TermsConsent(store: UserDefaultsStore(defaults)) }

    func testNothingIsAgreedOnAFreshDevice() {
        XCTAssertFalse(AuthTermsGate.initiallyAgreed(consent: consent()))
    }

    func testRefusesWithoutAgreementAndRecordsNothing() {
        XCTAssertFalse(AuthTermsGate.allow(agreed: false, consent: consent()))
        XCTAssertFalse(consent().hasAccepted, "a refusal must not leave a stored agreement behind")
    }

    func testAgreeingAllowsAndRecordsTheCurrentVersion() {
        XCTAssertTrue(AuthTermsGate.allow(agreed: true, consent: consent()))
        XCTAssertTrue(consent().hasAccepted)
        XCTAssertEqual(defaults.string(forKey: UserDefaultsStore.Key.ugcTermsAccepted.rawValue), TermsConsent.currentVersion)
    }

    func testAgreeingAtLoginAlsoSatisfiesThePostingGate() {
        _ = AuthTermsGate.allow(agreed: true, consent: consent())
        var asked = false, posted = false
        XCTAssertTrue(consent().postOrAsk(ask: { asked = true }, post: { posted = true }))
        XCTAssertFalse(asked)
        XCTAssertTrue(posted)
    }

    func testTheBoxStartsTickedOnlyForTheCurrentTermsVersion() {
        defaults.set("2020-01", forKey: UserDefaultsStore.Key.ugcTermsAccepted.rawValue)
        XCTAssertFalse(AuthTermsGate.initiallyAgreed(consent: consent()), "an older version must be agreed again")
        consent().accept()
        XCTAssertTrue(AuthTermsGate.initiallyAgreed(consent: consent()))
    }

    func testTheTermsLinkPointsAtThePublishedTermsPage() {
        // The in-app Terms sheet is a web view of this exact URL (LegalPageView); a typo here would show Apple a wrong page.
        XCTAssertEqual(LegalDocument.terms.url.absoluteString, "https://www.tappyai.com/terms")
        XCTAssertEqual(AuthTermsConsentView.guidelinesURL, "https://www.tappyai.com/community-guidelines")
    }

    func testEverySignInSurfaceCarriesTheGate() throws {
        // Source-level guard against a new sign-in path that forgets the gate (the view models are not
        // constructible without a live AuthRepository, so this reads the files like the other parity guards).
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let vm = try String(contentsOf: root.appendingPathComponent("TappyAI/Features/Auth/UI/AuthViewModel.swift"), encoding: .utf8)
        for method in ["signInWithPassword", "sendOTP", "verifyOTP", "continueWithGoogle", "continueWithZalo", "finishApple"] {
            let range = try XCTUnwrap(vm.range(of: "func \(method)("), "\(method) missing")
            let rest = vm[range.upperBound...]
            let body = rest[..<(rest.range(of: "\n    func ")?.lowerBound ?? rest.endIndex)]   // this method only
            XCTAssertTrue(body.contains("termsAllowSignIn()"), "\(method) must ask the Terms gate first")
        }
        let register = try String(contentsOf: root.appendingPathComponent("TappyAI/Features/Auth/UI/RegisterView.swift"), encoding: .utf8)
        XCTAssertTrue(register.contains("AuthTermsGate.allow("), "registration must ask the Terms gate")
    }
}
