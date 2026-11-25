import XCTest
import UIKit
@testable import TappyAI

/// "Hỏi Tappy thử" cards — the web's `getDynamicPrompts` + `assignCardArt` + card badge (HomeV3.tsx).
final class HomeSuggestedCardsTests: XCTestCase {

    /// Deterministic generator (SplitMix64) so selection can be checked without flakiness.
    struct SeededRNG: RandomNumberGenerator {
        var state: UInt64
        mutating func next() -> UInt64 {
            state &+= 0x9E3779B97F4A7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
            z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
            return z ^ (z >> 31)
        }
    }

    // MARK: Prompt generator

    func testFiveCardsHalfAnyTopicAnyHourAnyDay() {
        for seed in 1...40 {
            for hour in [2, 7, 12, 15, 18, 22] {
                for day in 0...6 {
                    var rng = SeededRNG(state: UInt64(seed))
                    let cards = HomeSuggestedPrompts.get(hour: hour, dayOfWeek: day, count: 5, using: &rng)
                    XCTAssertEqual(cards.count, 5)
                    XCTAssertEqual(cards.filter { $0.category == "general" }.count, 3, "ceil(5/2) any-topic prompts")
                    XCTAssertEqual(Set(cards.map { $0.text }).count, 5, "no repeated text")
                    XCTAssertEqual(cards[0].category, "general", "any-topic first, then they alternate")
                    XCTAssertEqual(cards[2].category, "general")
                    XCTAssertEqual(cards[4].category, "general")
                    for c in cards {
                        XCTAssertEqual(c.topic != nil, c.category == "general", "only any-topic prompts carry a topic")
                        XCTAssertFalse(c.emoji.isEmpty)
                    }
                }
            }
        }
    }

    func testVerticalsNeverRunOfOneCategory() {
        for seed in 1...60 {
            var rng = SeededRNG(state: UInt64(seed))
            let cards = HomeSuggestedPrompts.get(hour: 12, dayOfWeek: 2, count: 5, using: &rng)
            let verticals = cards.filter { $0.category != "general" }
            XCTAssertEqual(verticals.count, 2)
            XCTAssertNotEqual(verticals[0].category, verticals[1].category)
        }
    }

    func testSameSeedSameRow() {
        var a = SeededRNG(state: 7), b = SeededRNG(state: 7)
        XCTAssertEqual(HomeSuggestedPrompts.get(hour: 9, dayOfWeek: 6, count: 5, using: &a),
                       HomeSuggestedPrompts.get(hour: 9, dayOfWeek: 6, count: 5, using: &b))
    }

    func testTimeSlotPoolsDriveTheVerticals() {
        // Night draws from the night pool: its Karaoke prompt can only come from there.
        let night = Set(HomeSuggestedPrompts.night.map { $0.text })
        var sawNight = false
        for seed in 1...40 {
            var rng = SeededRNG(state: UInt64(seed))
            let cards = HomeSuggestedPrompts.get(hour: 22, dayOfWeek: 2, count: 5, using: &rng)
            if cards.contains(where: { night.contains($0.text) }) { sawNight = true }
        }
        XCTAssertTrue(sawNight)
    }

    func testPoolSizesMatchTheWeb() {
        XCTAssertEqual(HomeSuggestedPrompts.general.count, 16)
        XCTAssertEqual(HomeSuggestedPrompts.discovery.count, 8)
        XCTAssertEqual(HomeSuggestedPrompts.witty.count, 12)
        XCTAssertEqual(Set(HomeSuggestedPrompts.general.compactMap { $0.topic }),
                       ["work", "study", "money", "health", "family", "news", "tech", "writing"])
    }

    func testVietnamTimeZoneDrivesHourAndDay() {
        // 2026-11-24 18:00 UTC is 01:00 on Wednesday 25/11 in Vietnam (UTC+7).
        let utc = Date(timeIntervalSince1970: 1_795_543_200)
        let vn = HomeSuggestedPrompts.vietnamHourAndDay(utc)
        XCTAssertEqual(vn.hour, 1)
        XCTAssertEqual(vn.dayOfWeek, 3, "Wednesday, JS-style (0 = Sunday)")
    }

    func testBadgeEmojiAndToneFollowThePrompt() {
        let coffee = HomeSuggestedPrompts.morning[1].prompt
        XCTAssertEqual(coffee.emoji, "☕"); XCTAssertEqual(coffee.tone, "cafe")
        let noodles = HomeSuggestedPrompts.morning[0].prompt
        XCTAssertEqual(noodles.emoji, "🍜"); XCTAssertEqual(noodles.tone, "food")
        let money = HomeSuggestedPrompts.general[2].prompt
        XCTAssertEqual(money.emoji, "💰"); XCTAssertEqual(money.tone, "general")
        let work = HomeSuggestedPrompts.general[0].prompt
        XCTAssertEqual(work.emoji, "💡", "no authored emoji → the general default")
    }

    // MARK: Art

    func testArtIsDeterministicAndNeverRepeatsInAFiveRow() {
        let row: [[HomeCardArt.Card]] = [
            [.init(category: "general", topic: "work"), .init(category: "food"), .init(category: "general", topic: "money"), .init(category: "food"), .init(category: "general", topic: "money")],
            [.init(category: "food"), .init(category: "food"), .init(category: "food"), .init(category: "food"), .init(category: "food")],
            [.init(category: "travel"), .init(category: "spa"), .init(category: "spa"), .init(category: "spa"), .init(category: "spa")],
            [.init(category: "general", topic: "tech"), .init(category: "general", topic: "writing"), .init(category: "general"), .init(category: "general", topic: "news"), .init(category: "entertainment")],
        ]
        for cards in row {
            let a = HomeCardArt.assign(cards)
            XCTAssertEqual(a, HomeCardArt.assign(cards))
            XCTAssertEqual(Set(a).count, 5, "\(a)")
        }
    }

    func testVerticalCardTakesItsOwnCategoryScenes() {
        let art = HomeCardArt.assign([.init(category: "food"), .init(category: "food"), .init(category: "travel")])
        XCTAssertEqual(art, ["/home/inspire/food.webp", "/home/inspire/food-2.webp", "/home/inspire/travel.webp"])
        // No food card ever shows an airplane or a spa scene while its own scenes are free.
        for c in ["food", "travel", "shopping", "spa", "entertainment"] {
            let a = HomeCardArt.assign([.init(category: c), .init(category: c), .init(category: c)])
            XCTAssertTrue(a.allSatisfy { $0.hasPrefix("/home/inspire/\(c)") }, "\(c): \(a)")
        }
    }

    func testTopicPhotosThenMascotRotatedByPosition() {
        let art = HomeCardArt.assign([
            .init(category: "general", topic: "money"), .init(category: "general", topic: "money"), .init(category: "general", topic: "money"),
            .init(category: "general", topic: "tech"), .init(category: "general"),
        ])
        XCTAssertEqual(art[0], "/home/topics/money.webp")
        XCTAssertEqual(art[1], "/home/topics/money-2.webp", "a repeated topic takes the topic's next picture")
        XCTAssertEqual(art[2], "/tappy/thinking.png", "topic exhausted → first neutral pose")
        XCTAssertEqual(art[3], "/home/topics/tech.webp")
        XCTAssertEqual(art[4], "/tappy/speaking.png", "poses rotate by position")
        XCTAssertTrue(HomeCardArt.isMascot(art[2]))
        XCTAssertFalse(HomeCardArt.isMascot(art[0]))
    }

    func testRealImageryWinsOutright() {
        let art = HomeCardArt.assign([.init(category: "food", topic: nil, imageUrl: "https://x/p.jpg")])
        XCTAssertEqual(art, ["https://x/p.jpg"])
    }

    func testPoolIsFifteenAndSixthCardCannotCrash() {
        XCTAssertEqual(HomeCardArt.pool.count, 15)
        let art = HomeCardArt.assign((0..<20).map { _ in HomeCardArt.Card(category: "food") })
        XCTAssertEqual(art.count, 20)
    }

    // MARK: Card wiring

    func testOnlyTheFiveVerticalsCarryALabel() {
        XCTAssertEqual(HomeSuggestionsSection.labelKey("food"), "home.suggest.cat.food")
        XCTAssertEqual(HomeSuggestionsSection.labelKey("spa"), "home.suggest.cat.spa")
        XCTAssertNil(HomeSuggestionsSection.labelKey("general"))
    }

    func testSuggestionsCarryPromptEmojiToneAndArtInOrder() {
        let prompts = HomeSuggestedPrompts.general.prefix(3).map { $0.prompt } + [HomeSuggestedPrompts.morning[1].prompt]
        let cards = HomeSuggestionsSection.suggestions(from: Array(prompts), english: true)
        XCTAssertEqual(cards.map { $0.id }, [1, 2, 3, 4], "ids feed home-suggestion-N")
        XCTAssertEqual(cards[0].text, prompts[0].textEn)
        XCTAssertEqual(cards[1].emoji, "🎓")
        XCTAssertEqual(cards[3].tone, "cafe")
        XCTAssertEqual(cards[3].art, "/home/inspire/food.webp")
    }

    func testEveryArtIdResolvesToABundledFile() {
        var ids = HomeCardArt.pool
        ids += HomeCardArt.topicArt.values.flatMap { $0 }
        for id in ids {
            let file = HomeCardArtImage.photoFile(id)
            XCTAssertNotNil(file, id)
            XCTAssertNotNil(Bundle.main.path(forResource: file ?? "", ofType: "webp"), id)
        }
        for id in HomeCardArt.neutralMascot {
            let asset = HomeCardArtImage.mascotAsset(id)
            XCTAssertNotNil(asset, id)
            XCTAssertNotNil(UIImage(named: asset ?? ""), id)
        }
    }

    func testCategoryLabelKeysExistInBothLanguages() {
        for c in ["food", "travel", "shopping", "entertainment", "spa"] {
            let key = HomeSuggestionsSection.labelKey(c)!
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
