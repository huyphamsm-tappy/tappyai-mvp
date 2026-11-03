import XCTest
@testable import TappyAI

/// Regression guard for App Review Guideline 3.1.1 / 3.1.3(b) (rejection f64ea6cc-efd0-479c-999f-2741062fc50d, 20/10/2026).
///
/// The app may let a person use a plan bought elsewhere only if that plan can also be bought here with In-App Purchase,
/// and it must never point the person to another way to pay. These tests read the SOURCE TREE (as PrivacyManifestTests
/// does), so a new link, URL or sentence that leads away from In-App Purchase fails the build instead of App Review.
final class ExternalPurchaseGuardTests: XCTestCase {

    /// `ios/` in the source tree: this file is `ios/TappyAITests/ExternalPurchaseGuardTests.swift`.
    private let iosRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()

    private func swiftSources() throws -> [(path: String, text: String)] {
        let appRoot = iosRoot.appendingPathComponent("TappyAI")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil))
        var found: [(path: String, text: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = String(url.path.dropFirst(iosRoot.path.count + 1))
            found.append((path: relative, text: try String(contentsOf: url, encoding: .utf8)))
        }
        XCTAssertGreaterThan(found.count, 100, "the scan must really read the app sources")
        return found
    }

    /// No payment provider, price page or payment route of the website appears anywhere in the app code.
    func testNoWebPaymentOrPricingReferenceInTheApp() throws {
        let forbidden = ["stripe", "sepay", "momo.vn", "tappyai.com/subscription", "tappyai.com/pricing",
                         "tappyai.com/plans", "/api/stripe", "/api/payments"]
        for source in try swiftSources() {
            let lower = source.text.lowercased()
            for token in forbidden {
                XCTAssertFalse(lower.contains(token), "\(source.path) mentions «\(token)»: a way to pay outside In-App Purchase (3.1.1)")
            }
        }
    }

    /// Every file that can open a URL is on this reviewed list. A new one must be reviewed for 3.1.1 before it is added.
    func testLinkOutsLiveOnlyInReviewedFiles() throws {
        let reviewed: Set<String> = [
            "TappyAI/Core/Navigation/AppRouter.swift",
            "TappyAI/Core/Payments/StoreKitProvider.swift",
            "TappyAI/Core/Privacy/AIConsentView.swift",
            "TappyAI/Core/Share/TappyShareSheet.swift",
            "TappyAI/Features/Auth/UI/AuthTermsConsentView.swift",
            "TappyAI/Features/Chat/UI/ChatMessageList.swift",
            "TappyAI/Features/Chat/UI/MediaBlocksView.swift",
            "TappyAI/Features/Chat/UI/PlaceCardView.swift",
            "TappyAI/Features/Chat/UI/PlanCardView.swift",
            "TappyAI/Features/Chat/UI/VoiceListeningView.swift",
            "TappyAI/Features/Deals/UI/DealsView.swift",
            "TappyAI/Features/Discovery/UI/ServiceDetailView.swift",
            "TappyAI/Features/Music/UI/CopyrightPolicyView.swift",
            "TappyAI/Features/Planner/UI/PlannerView.swift",
            "TappyAI/Features/Profile/Model/ProfileModels.swift",
            "TappyAI/Features/Profile/UI/LegalPageView.swift",
            "TappyAI/Features/Profile/UI/NotificationsSettingsView.swift",
            "TappyAI/Features/Profile/UI/SettingsView.swift",
            "TappyAI/Features/Profile/UI/SubscriptionView.swift",
            "TappyAI/Features/Reviews/UI/ReviewPostView.swift",
            "TappyAI/Features/UtilityTools/UI/ScamShield/ScamLibraryView.swift",
            "TappyAI/Features/UtilityTools/UI/ScamShield/ScamQRView.swift",
            "TappyAI/Features/UtilityTools/UI/ScamShield/ScamShieldView.swift",
        ]
        let openers = ["UIApplication.shared.open", "Link(destination", "openURL", ".open("]
        let found = Set(try swiftSources().filter { source in openers.contains { source.text.contains($0) } }.map(\.path))
        XCTAssertEqual(found.subtracting(reviewed), [], "new file that opens URLs: review it for 3.1.1, then add it to this list")
        XCTAssertEqual(reviewed.subtracting(found), [], "listed file no longer opens URLs: remove it from the list")
    }

    /// The payment code and the Pro screen can reach exactly three addresses: Terms, Privacy, and Apple's own subscriptions page.
    func testPaymentSurfacesOnlyReachAllowedAddresses() throws {
        let allowed: Set<String> = [
            "https://www.tappyai.com/terms",
            "https://www.tappyai.com/privacy",
            "https://apps.apple.com/account/subscriptions",
        ]
        let pattern = try NSRegularExpression(pattern: #"URL\(string: "([^"]+)""#)
        var checked = 0
        for source in try swiftSources()
        where source.path.hasPrefix("TappyAI/Core/Payments/") || source.path == "TappyAI/Features/Profile/UI/SubscriptionView.swift" {
            let range = NSRange(source.text.startIndex..., in: source.text)
            for match in pattern.matches(in: source.text, range: range) {
                let literal = try XCTUnwrap(Range(match.range(at: 1), in: source.text).map { String(source.text[$0]) })
                XCTAssertTrue(allowed.contains(literal), "\(source.path) reaches \(literal)")
                checked += 1
            }
        }
        XCTAssertEqual(checked, 3, "Terms, Privacy and the App Store subscriptions page")
    }

    /// The build that goes to App Review turns the purchase UI on; a build that names nothing has no buy button.
    func testReleaseBuildTurnsThePurchaseUIOn() throws {
        let release = try String(contentsOf: iosRoot.appendingPathComponent("Config/Release.xcconfig"), encoding: .utf8)
        let line = try XCTUnwrap(release.split(separator: "\n").first { $0.hasPrefix("SWIFT_ACTIVE_COMPILATION_CONDITIONS") })
        XCTAssertTrue(line.contains("IAP_PURCHASE_UI"), String(line))
    }

    // MARK: - Words on the subscription screens

    private func strings() throws -> [String: [String: Any]] {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("TappyAI/Resources/Localizable.xcstrings"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(root["strings"] as? [String: [String: Any]])
    }

    private func values(_ entry: [String: Any]) -> [String: String] {
        guard let localizations = entry["localizations"] as? [String: [String: Any]] else { return [:] }
        return localizations.compactMapValues { ($0["stringUnit"] as? [String: Any])?["value"] as? String }
    }

    /// Sentences of the Pro screen, the profile Pro row, Restore and the deletion warning never send the person to a website or another way to pay.
    func testSubscriptionSentencesDoNotPointOutsideTheApp() throws {
        let words = ["web", "trang web", "trình duyệt", "browser", "stripe", "sepay", "vietqr", "momo", "bank", "ngân hàng",
                     "chuyển khoản", "tappyai.com", "cheaper", "rẻ hơn"]
        var checked = 0
        let exactKeys: Set<String> = ["profile.row.pro", "profile.row.pro.desc", "settings.restorePurchases",
                                      "settings.restorePurchases.desc", "account.delete.plan.known", "account.delete.plan.generic"]
        for (key, entry) in try strings() where key.hasPrefix("sub.") || exactKeys.contains(key) {
            for (language, value) in values(entry) {
                let lower = value.lowercased()
                for word in words {
                    XCTAssertFalse(lower.contains(word), "\(key) [\(language)] says «\(word)»: \(value)")
                }
                checked += 1
            }
        }
        XCTAssertGreaterThan(checked, 40)
    }

    /// The Pro plan promises only what the backend really gives: 30 AI questions a day and every AI feature.
    func testProPromisesOnlyWhatTheBackendGives() throws {
        let all = try strings()
        for key in ["sub.hero.desc", "sub.pro.desc", "sub.pro.messages", "profile.row.pro.desc"] {
            let entry = try XCTUnwrap(all[key], key)
            let byLanguage = values(entry)
            XCTAssertNotNil(byLanguage["en"], key)
            XCTAssertNotNil(byLanguage["vi"], key)
            for (language, value) in byLanguage {
                let lower = value.lowercased()
                for word in ["unlimited", "no limits", "không giới hạn", "priority", "ưu tiên"] {
                    XCTAssertFalse(lower.contains(word), "\(key) [\(language)]: \(value)")
                }
                XCTAssertTrue(value.contains("30"), "\(key) [\(language)] must state the real allowance: \(value)")
            }
        }
        let view = try String(contentsOf: iosRoot.appendingPathComponent("TappyAI/Features/Profile/UI/SubscriptionView.swift"), encoding: .utf8)
        for removed in ["sub.pro.priority", "sub.pro.voice", "sub.pro.memory", "sub.pro.search", "sub.pro.history",
                        "sub.free.search", "sub.free.history"] {
            XCTAssertFalse(view.contains(removed), "the Pro screen must not list «\(removed)»: the backend has no such plan difference")
        }
    }
}
