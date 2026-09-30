import XCTest
@testable import TappyAI

/// `/api/config` must decode against what production ACTUALLY serves. TestFlight build 50 (30/09)
/// required `freemium.anonLifetimeLimit`; production (main f42ae4b) sends `anonDailyLimit`, so the
/// whole config failed and login showed "Không tải được cấu hình" for everyone.
final class AppConfigDecodeTests: XCTestCase {
    /// Verbatim body of GET https://www.tappyai.com/api/config on 2026-09-30.
    private let production = #"""
    {"freemium":{"freeDailyLimit":15,"anonDailyLimit":5},"flags":{"showProUpgrade":false,"showAppConnections":false,"showScamShield":true},"upload":{"maxPhotosPerReview":6,"maxVideoSizeMb":150,"maxVideoDurationSec":300,"maxVideoDurationAcceptSec":305},"scamShield":{"dailyLimitAuth":30,"dailyLimitAnon":10},"video":{"linkProviders":["youtube"]},"auth":{"providers":[{"id":"google","enabled":true},{"id":"zalo","enabled":true},{"id":"email","enabled":true}]},"onboarding":{"interests":[{"id":"food","emoji":"🍜","key":"tag.food"},{"id":"spa","emoji":"💆","key":"tag.spa"}],"cities":["TP. Hồ Chí Minh","Hà Nội"]}}
    """#

    func testProductionBodyDecodes() throws {
        let cfg = try ResponseDecoder.json.decode(AppConfig.self, from: Data(production.utf8))
        XCTAssertEqual(cfg.auth?.providers.map(\.id), ["google", "zalo", "email"])
        XCTAssertEqual(cfg.upload.maxPhotosPerReview, 6)
        XCTAssertEqual(cfg.freemium?.freeDailyLimit, 15)
        XCTAssertNil(cfg.freemium?.anonLifetimeLimit, "old field name is not read as the lifetime limit")
        XCTAssertEqual(cfg.onboarding?.cities?.count, 2)
    }

    func testMalformedOptionalSectionDoesNotFailTheConfig() throws {
        let json = #"{"freemium":"oops","flags":{"showProUpgrade":false},"upload":{"maxPhotosPerReview":6,"maxVideoSizeMb":150,"maxVideoDurationSec":300},"auth":{"providers":"oops"}}"#
        let cfg = try ResponseDecoder.json.decode(AppConfig.self, from: Data(json.utf8))
        XCTAssertNil(cfg.freemium)
        XCTAssertNil(cfg.auth)
    }

    func testMissingRequiredSectionStillFails() {
        let json = #"{"flags":{"showProUpgrade":false}}"#
        XCTAssertThrowsError(try ResponseDecoder.json.decode(AppConfig.self, from: Data(json.utf8)))
    }

    func testInterestLabelFromKey() {
        let food = AppConfig.Onboarding.Interest(id: "food", labelVi: nil, labelEn: nil, key: "tag.food", emoji: "🍜")
        XCTAssertEqual(food.label(locale: "vi", localize: { $0 == "tag.food" ? "Ăn uống" : $0 }), "🍜 Ăn uống")
        let unknown = AppConfig.Onboarding.Interest(id: "x", labelVi: nil, labelEn: nil, key: "tag.x", emoji: nil)
        XCTAssertEqual(unknown.label(locale: "vi", localize: { $0 }), "x")
        let labelled = AppConfig.Onboarding.Interest(id: "y", labelVi: "Nhãn", labelEn: "Label", key: nil, emoji: nil)
        XCTAssertEqual(labelled.label(locale: "en"), "Label")
    }
}
