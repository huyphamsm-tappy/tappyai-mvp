import Foundation

/// The chat's ONE welcome (web `ChatInterface` empty state): the same screen whichever shortcut opened the chat, because the
/// one-brain server decides what the question is, not the app. The words live in the String Catalog and are resolved in the
/// app's own language (`AppLanguage`), which can differ from the device's and changes without a restart.
enum ChatWelcome {
    /// The brand, not a field of life (the old welcome titled itself «Ăn uống», «Du lịch»… by `category`).
    static let title = "TappyAI"

    struct Mood: Equatable {
        let id: String
        let emoji: String
    }

    /// Web `MOODS`, same order.
    static let moods: [Mood] = [
        Mood(id: "happy", emoji: "😊"),
        Mood(id: "sad", emoji: "😔"),
        Mood(id: "stress", emoji: "😤"),
        Mood(id: "tired", emoji: "😴"),
        Mood(id: "bored", emoji: "🥱"),
        Mood(id: "excited", emoji: "🤩"),
    ]

    static func moodLabel(_ mood: Mood, language: String) -> String { text("chat.mood.\(mood.id)", language: language) }
    static func moodPrompt(_ mood: Mood, language: String) -> String { text("chat.mood.\(mood.id).prompt", language: language) }

    /// A catalog key in `language` ("vi" or "en"), looked up in that language's own `.lproj` (`String(localized:)` would use
    /// the DEVICE language, and the app's language can be switched at runtime).
    static func text(_ key: String, language: String) -> String {
        let code = language.hasPrefix("en") ? "en" : "vi"
        let bundle = Bundle.main.path(forResource: code, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        return bundle.localizedString(forKey: key, value: nil, table: nil)
    }
}
