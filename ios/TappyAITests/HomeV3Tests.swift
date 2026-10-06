import XCTest
import UIKit
@testable import TappyAI

/// Home V3 (Android L12) — the pure pieces: the greeting engine, the hero split, card art, rails.
final class HomeV3Tests: XCTestCase {

    // MARK: Greeting engine (byte-identical pools to web/Android)

    func testSlotsFollowTheLocalHour() {
        XCTAssertEqual(HomeGreeting.heroText(hour: 2, isWeekend: false, dayOfMonth: 0, english: false),
                       "Thức khuya à?\nTappy đây, cần gì không? 🌙")
        XCTAssertEqual(HomeGreeting.heroText(hour: 12, isWeekend: false, dayOfMonth: 2, english: false),
                       "Cơm trưa chưa?\nHỏi Tappy trước khi Google nha 😄")
        XCTAssertEqual(HomeGreeting.heroText(hour: 21, isWeekend: false, dayOfMonth: 1, english: true),
                       "End of the day —\nlet Tappy help you unwind! 🛁")
    }

    func testTemplateRotatesByDayOfMonth() {
        let a = HomeGreeting.heroText(hour: 15, isWeekend: false, dayOfMonth: 0, english: false)
        let b = HomeGreeting.heroText(hour: 15, isWeekend: false, dayOfMonth: 1, english: false)
        let wrap = HomeGreeting.heroText(hour: 15, isWeekend: false, dayOfMonth: 4, english: false)
        XCTAssertNotEqual(a, b)
        XCTAssertEqual(a, wrap, "4 templates in the afternoon slot → day 4 wraps to day 0")
    }

    func testWeekendVariantsOnlyWhereTheyExist() {
        XCTAssertEqual(HomeGreeting.heroText(hour: 6, isWeekend: true, dayOfMonth: 0, english: false),
                       "Sáng cuối tuần đây!\nNghỉ ngơi hay đi đâu vui? ☀️")
        // Noon has no weekend pool: weekday text.
        XCTAssertEqual(HomeGreeting.heroText(hour: 12, isWeekend: true, dayOfMonth: 0, english: false),
                       HomeGreeting.heroText(hour: 12, isWeekend: false, dayOfMonth: 0, english: false))
    }

    func testUnknownHourFallsBackToMorning() {
        XCTAssertEqual(HomeGreeting.heroText(hour: 99, isWeekend: false, dayOfMonth: 0, english: false),
                       "Chào buổi sáng!\nHôm nay ăn gì ngon đây? ☀️")
    }

    // MARK: Hero

    func testHeroSplitsTheEngineTextAndNeverInventsAName() {
        let named = HeroGreeting.make(engineText: "Đói chưa?\nTappy tìm chỗ ăn trưa ngon ngay! 🍚", userName: " Huy ",
                                      named: { "Hi \($0)! 👋" }, generic: { "Chào bạn! 👋" })
        XCTAssertEqual(named, HeroGreeting(welcome: "Hi Huy! 👋", title: "Đói chưa?", supporting: "Tappy tìm chỗ ăn trưa ngon ngay! 🍚"))
        let guest = HeroGreeting.make(engineText: "One line", userName: "  ", named: { "Hi \($0)" }, generic: { "Chào bạn! 👋" })
        XCTAssertEqual(guest.welcome, "Chào bạn! 👋")
        XCTAssertNil(guest.supporting)
    }

    // MARK: Suggestion art (web assignCardArt)

    func testArtIsUniqueWhileThePoolAllowsIt() {
        let art = HomeInspireArt.assign(["food", "entertainment", "food", "travel", "shopping", "entertainment"])
        XCTAssertEqual(art, ["food", "entertainment", "spa", "travel", "shopping", "food"])
        XCTAssertEqual(Set(art.prefix(5)).count, 5, "no two of the first five cards share a picture")
    }

    func testArtFilesShipInTheBundle() {
        for name in HomeInspireArt.pool {
            XCTAssertNotNil(Bundle.main.path(forResource: "home_inspire_\(name)", ofType: "webp"), name)
        }
    }

    // MARK: Rails

    func testVideoRailKeepsOnlyPlayableClips() throws {
        let json = """
        [{"id":"v1","content_type":"video","thumbnail":"https://x/t.jpg","like_count":1,"comment_count":0,"save_count":0,"created_at":"2026-09-01T00:00:00Z"},
         {"id":"v2","content_type":"video","like_count":1,"comment_count":0,"save_count":0,"created_at":"2026-09-01T00:00:00Z"},
         {"id":"p1","content_type":"photo","media_url":"https://x/p.jpg","like_count":1,"comment_count":0,"save_count":0,"created_at":"2026-09-01T00:00:00Z"}]
        """
        let reviews = try ResponseDecoder.json.decode(LossyList<Review>.self, from: Data(json.utf8)).items
        XCTAssertEqual(reviews.count, 3, "fixture rows decode")
        XCTAssertEqual(HomeViewModel.playableVideos(reviews).map(\.id), ["v1"])
    }

    func testLikeCountsAreCompact() {
        XCTAssertEqual(HomeVideosSection.compact(12_400), "12.4K")
        XCTAssertEqual(HomeVideosSection.compact(2_000_000), "2M")
        XCTAssertEqual(HomeVideosSection.compact(999), "999")
    }

    // MARK: Smart Tools

    func testHomePreviewsFiveToolsAndEveryToolOpensAnExistingScreen() {
        // Web src/lib/tools/registry.ts:70-75 lists safety first, then scan/translate/currency/split with `home: true`;
        // `homeSmartTools()` (registry.ts:109-110) is that subset and HomeV3.tsx:752 renders exactly those five.
        // Together/Fortune/Captions are `home: false` (registry.ts:80,84,85): catalogue only.
        XCTAssertEqual(SmartTool.home.map(\.id), [.safety, .scan, .translate, .currency, .split])
        XCTAssertEqual(SmartTool.all.map(\.id), [.safety, .scan, .translate, .currency, .split, .together, .fortune, .captions])
        XCTAssertEqual(SmartTool.all.filter { $0.group == .daily }.map(\.id), [.safety, .scan, .translate, .currency, .split])
        XCTAssertEqual(SmartTool.all.first { $0.id == .together }?.destination, .groupDining)
        XCTAssertEqual(SmartTool.all.first { $0.id == .safety }?.destination, .scamShield)
        for tool in SmartTool.all { XCTAssertNotNil(UIImage(named: tool.mascot), tool.mascot) }
    }
}
