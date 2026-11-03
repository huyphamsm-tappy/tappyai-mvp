import XCTest
@testable import TappyAI

/// Privacy / Terms open the published web documents, in the app's language.
final class LegalPageTests: XCTestCase {

    func testDocumentsAreTheCanonicalWebPages() {
        XCTAssertEqual(LegalDocument.privacy.url.absoluteString, "https://www.tappyai.com/privacy")
        XCTAssertEqual(LegalDocument.terms.url.absoluteString, "https://www.tappyai.com/terms")
    }

    func testWebLocaleFollowsTheAppLanguage() {
        XCTAssertEqual(LegalDocument.webLocale(for: "vi"), "vi")
        XCTAssertEqual(LegalDocument.webLocale(for: "en"), "en")
        XCTAssertEqual(LegalDocument.webLocale(for: "fr"), "en", "the web has only vi and en")
        XCTAssertEqual(LegalDocument.localeScript(for: "vi"),
                       "try { window.localStorage.setItem('tappy_lang', 'vi') } catch (e) {}")
    }

    func testStringsExist() {
        for key in LegalDocument.allCases.map(\.titleKey) + ["legal.loadFailed", "legal.openInBrowser"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
