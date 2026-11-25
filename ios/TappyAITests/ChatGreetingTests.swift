import XCTest
@testable import TappyAI

/// The empty chat's one greeting line, as the web's `homeGreeting.ts` (owner UAT: «vào khung chat không có câu chào mở đầu»).
final class ChatGreetingTests: XCTestCase {
    func testDayPartsFollowTheWebHours() {
        XCTAssertEqual(ChatGreeting.dayPart(hour: 5), .dawn)
        XCTAssertEqual(ChatGreeting.dayPart(hour: 10), .dawn)
        XCTAssertEqual(ChatGreeting.dayPart(hour: 11), .noon)
        XCTAssertEqual(ChatGreeting.dayPart(hour: 14), .afternoon)
        XCTAssertEqual(ChatGreeting.dayPart(hour: 18), .evening)
        XCTAssertEqual(ChatGreeting.dayPart(hour: 22), .evening)
        XCTAssertEqual(ChatGreeting.dayPart(hour: 23), .night)
        XCTAssertEqual(ChatGreeting.dayPart(hour: 4), .night)
    }

    func testWeekendLinesUntilTheEvening() {
        XCTAssertEqual(ChatGreeting.key(hour: 9, weekday: 7, dayOfYear: 10).part, .weekend)   // Saturday morning
        XCTAssertEqual(ChatGreeting.key(hour: 9, weekday: 1, dayOfYear: 10).part, .weekend)   // Sunday
        XCTAssertEqual(ChatGreeting.key(hour: 20, weekday: 7, dayOfYear: 10).part, .evening)  // Saturday evening
        XCTAssertEqual(ChatGreeting.key(hour: 9, weekday: 3, dayOfYear: 10).part, .dawn)
    }

    func testTheVariantIsChosenByTheDateAndStaysInRange() {
        for day in 1...366 { for hour in 0..<24 {
            let v = ChatGreeting.key(hour: hour, weekday: 3, dayOfYear: day).variant
            XCTAssertTrue((0..<3).contains(v))
        } }
        XCTAssertEqual(ChatGreeting.key(hour: 8, weekday: 3, dayOfYear: 100).variant, (100 + 8) % 3)
    }

    func testEveryPartHasThreeLinesInBothLanguages() {
        for part in ChatGreeting.DayPart.allCases {
            XCTAssertEqual(ChatGreeting.vi[part]?.count, 3, "\(part)")
            XCTAssertEqual(ChatGreeting.en[part]?.count, 3, "\(part)")
        }
    }

    func testTheGivenNameIsTheLastWordAndOddNamesAreIgnored() {
        XCTAssertEqual(ChatGreeting.givenName(of: "Nguyễn Văn An"), "An")
        XCTAssertEqual(ChatGreeting.givenName(of: "  PHẠM ĐOÀN HUY "), "HUY")
        XCTAssertNil(ChatGreeting.givenName(of: nil))
        XCTAssertNil(ChatGreeting.givenName(of: ""))
        XCTAssertNil(ChatGreeting.givenName(of: "huy@example.com"))
        XCTAssertNil(ChatGreeting.givenName(of: "User 123"))
        XCTAssertNil(ChatGreeting.givenName(of: String(repeating: "a", count: 21)))
    }

    func testTheNameGoesInFrontAndTheLineStartsLowerCase() {
        XCTAssertEqual(ChatGreeting.withName("Chào buổi sáng! Hôm nay mình giúp gì được cho bạn?", name: "Huy", english: false),
                       "Huy ơi, chào buổi sáng! Hôm nay mình giúp gì được cho bạn?")
        XCTAssertEqual(ChatGreeting.withName("Good morning! What can I help with today?", name: "Huy", english: true),
                       "Huy, good morning! What can I help with today?")
        XCTAssertEqual(ChatGreeting.withName("Chiều rồi, bạn cần mình giúp gì không?", name: nil, english: false), "Chiều rồi, bạn cần mình giúp gì không?")
    }

    func testALineIsAlwaysProduced() {
        let line = ChatGreeting.line(at: Date(timeIntervalSince1970: 1_790_000_000), english: false, name: "Huy")
        XCTAssertTrue(line.hasPrefix("Huy ơi, "))
    }
}
