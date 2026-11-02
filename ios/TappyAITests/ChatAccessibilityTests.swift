import XCTest
@testable import TappyAI

/// Review 02/11 (iOS = Android `cc1ac64`): every button that is only an icon has a spoken name, a touch target of at least 44 pt, and the read-aloud
/// player's «15 / 15» and speed controls say what they do. All the words go through the string catalog (vi and en), none are written in the code.
@MainActor
final class ChatAccessibilityTests: XCTestCase {

    private static let newKeys = [
        "a11y.chat.like", "a11y.chat.dislike", "a11y.chat.speak", "a11y.chat.regenerate", "a11y.chat.more", "a11y.chat.mic",
        "a11y.chat.ttsPause", "a11y.chat.ttsPlay", "a11y.chat.ttsBack", "a11y.chat.ttsForward", "a11y.chat.ttsSpeed", "a11y.chat.ttsStop",
    ]

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    private func catalog() throws -> [String: Any] {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("TappyAI/Resources/Localizable.xcstrings"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(json["strings"] as? [String: Any])
    }

    private func value(_ key: String, _ lang: String, in strings: [String: Any]) -> String? {
        let entry = strings[key] as? [String: Any]
        let loc = (entry?["localizations"] as? [String: Any])?[lang] as? [String: Any]
        return (loc?["stringUnit"] as? [String: Any])?["value"] as? String
    }

    func testEveryNewNameIsInTheCatalogInBothLanguages() throws {
        let strings = try catalog()
        for key in Self.newKeys {
            for lang in ["vi", "en"] {
                XCTAssertFalse((value(key, lang, in: strings) ?? "").isEmpty, "\(key) \(lang)")
            }
        }
        XCTAssertEqual(value("a11y.chat.ttsBack", "vi", in: strings), "Lùi 15 giây")
        XCTAssertEqual(value("a11y.chat.ttsForward", "en", in: strings), "Forward 15 seconds")
    }

    func testTheActionBarNamesEveryIconButtonAndKeepsA44PointTarget() throws {
        let bar = try source("TappyAI/Features/Chat/UI/MessageActionBar.swift")
        for key in ["common.copy", "common.copied", "common.share", "a11y.chat.like", "a11y.chat.dislike", "a11y.chat.speak",
                    "a11y.chat.regenerate", "a11y.chat.more", "a11y.chat.ttsPause", "a11y.chat.ttsPlay", "a11y.chat.ttsBack",
                    "a11y.chat.ttsForward", "a11y.chat.ttsSpeed", "a11y.chat.ttsStop"] {
            XCTAssertTrue(bar.contains("\"\(key)\""), key)
        }
        XCTAssertTrue(bar.contains("minimumTapTarget()"))
        XCTAssertFalse(bar.contains("minWidth: 28"), "a 28 pt icon is below the 44 pt minimum")
        XCTAssertFalse(bar.contains("height: 24)"), "the player's buttons are below the 44 pt minimum")
    }

    func testTheInputBarNamesTheEmojiAndMicButtonsAndEveryEmojiKeepsA44PointTarget() throws {
        let input = try source("TappyAI/Features/Chat/UI/ChatInputBar.swift")
        XCTAssertTrue(input.contains("\"chat.pickEmoji\""))
        XCTAssertTrue(input.contains("\"a11y.chat.mic\""))
        XCTAssertTrue(input.contains("\"voice.stopListening\""), "while listening the mic button says it stops")
        XCTAssertFalse(input.contains("width: 36, height: 36"), "an emoji cell is below the 44 pt minimum")
    }

    func testTheSpeedIsSaidAsTheSpeedNotAsXOnly() {
        let en = Locale(identifier: "en_US")
        XCTAssertEqual(ttsSpeedText(1, locale: en), "1x")
        XCTAssertEqual(ttsSpeedText(1.5, locale: en), "1.5x")
        XCTAssertEqual(ttsSpeedText(2, locale: en), "2.0x")
        XCTAssertEqual(ttsSpeedText(1.5, locale: Locale(identifier: "vi_VN")), "1,5x")
    }
}
