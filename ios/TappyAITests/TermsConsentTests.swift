import XCTest
@testable import TappyAI

/// Agreeing to the Terms before the first review or comment (App Store 1.2).
final class TermsConsentTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "TermsConsentTests")
        defaults.removePersistentDomain(forName: "TermsConsentTests")
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: "TermsConsentTests")
        super.tearDown()
    }

    func testFirstPostAsksAndDoesNotPost() {
        let consent = TermsConsent(store: UserDefaultsStore(defaults))
        var asked = false, posted = false
        XCTAssertFalse(consent.postOrAsk(ask: { asked = true }, post: { posted = true }))
        XCTAssertTrue(asked)
        XCTAssertFalse(posted)
    }

    func testAcceptedIsRememberedAndPostsDirectly() {
        TermsConsent(store: UserDefaultsStore(defaults)).accept()
        let later = TermsConsent(store: UserDefaultsStore(defaults))   // a new instance: stored, not in memory
        var asked = false, posted = false
        XCTAssertTrue(later.postOrAsk(ask: { asked = true }, post: { posted = true }))
        XCTAssertFalse(asked)
        XCTAssertTrue(posted)
    }

    func testAnOlderTermsVersionAsksAgain() {
        defaults.set("2020-01", forKey: UserDefaultsStore.Key.ugcTermsAccepted.rawValue)
        XCTAssertFalse(TermsConsent(store: UserDefaultsStore(defaults)).hasAccepted)
    }

    func testStringsExist() {
        for key in ["ugc.terms.title", "ugc.terms.body", "ugc.terms.rule1", "ugc.terms.rule2", "ugc.terms.rule3",
                    "ugc.terms.readFull", "ugc.terms.agree"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
