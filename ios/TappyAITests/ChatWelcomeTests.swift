import XCTest
@testable import TappyAI

/// The chat's ONE welcome (web `ChatInterface` empty state): the same screen whichever shortcut opened the chat, its words
/// in the String Catalog (resolved in the app's own language), the texts the web's `chat.*` keys carry.
final class ChatWelcomeTests: XCTestCase {

    func testTheSubtitleIsTheGeneralOneInBothLanguages() {
        XCTAssertEqual(ChatWelcome.text("chat.welcome.subtitle", language: "vi"),
                       "Hỏi mình bất cứ điều gì — tư vấn, giải thích, tra cứu, lên kế hoạch")
        XCTAssertEqual(ChatWelcome.text("chat.welcome.subtitle", language: "en"),
                       "Ask me anything — advice, explanations, lookups, plans")
    }

    func testTheTitleIsTheBrandNotAField() {
        XCTAssertEqual(ChatWelcome.title, "TappyAI")
    }

    func testSixMoodsWithTheWebWording() {
        XCTAssertEqual(ChatWelcome.moods.map(\.id), ["happy", "sad", "stress", "tired", "bored", "excited"])
        XCTAssertEqual(ChatWelcome.moodLabel(ChatWelcome.moods[0], language: "vi"), "Vui")
        XCTAssertEqual(ChatWelcome.moodLabel(ChatWelcome.moods[2], language: "en"), "Stressed")
        XCTAssertEqual(ChatWelcome.moodPrompt(ChatWelcome.moods[2], language: "vi"),
                       "Mình đang stress, việc cứ dồn lại. Tappy giúp mình bình tĩnh lại và sắp xếp được không?")
        XCTAssertEqual(ChatWelcome.moodPrompt(ChatWelcome.moods[4], language: "en"),
                       "I'm bored and don't know what to do. Anything fun and new to try?")
    }

    func testEveryWelcomeKeyResolvesInBothLanguages() {
        var keys = ["chat.welcome.subtitle", "chat.welcome.memory", "chat.welcome.moodQuestion",
                    "chat.chip.tonightPrompt", "chat.chip.tripPrefill", "chat.chip.priceWatchPrefill"]
        for m in ChatWelcome.moods { keys += ["chat.mood.\(m.id)", "chat.mood.\(m.id).prompt"] }
        for lang in ["vi", "en"] {
            for k in keys {
                let v = ChatWelcome.text(k, language: lang)
                XCTAssertFalse(v.isEmpty, "\(k) \(lang)")
                XCTAssertNotEqual(v, k, "\(k) \(lang) is missing from the catalog")
            }
        }
    }

    func testTheChipTextsAreTheWebOnes() {
        XCTAssertEqual(ChatWelcome.text("chat.chip.tripPrefill", language: "vi"), "Lịch trình ")
        XCTAssertEqual(ChatWelcome.text("chat.chip.tripPrefill", language: "en"), "Itinerary for ")
        XCTAssertEqual(ChatWelcome.text("chat.chip.priceWatchPrefill", language: "vi"), "Tappy theo dõi ")
        XCTAssertEqual(ChatWelcome.text("chat.chip.priceWatchPrefill", language: "en"), "Tappy, track ")
        XCTAssertEqual(ChatWelcome.text("chat.chip.tonightPrompt", language: "vi"),
                       "Tối nay mình muốn spa thư giãn rồi ăn tối ngon, 2 người, budget khoảng 800k, gợi ý lịch trình giúp mình nhé")
    }

    func testTheQuickPromptsDoNotDependOnAField() {
        // Any hour and weekday gives three prompts from the general pool (web `getDynamicPrompts(hour, day, null, null, 3)`).
        for hour in [7, 12, 15, 18, 22] {
            XCTAssertEqual(DynamicPrompts.get(hour: hour, dayOfWeek: 2, count: 3).count, 3)
        }
    }
}
