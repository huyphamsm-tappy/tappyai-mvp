import Foundation

/// Which language a reply should be READ ALOUD in.
///
/// Deliberately NOT decided on the device. The backend's `detectLang()` was shaped by two
/// production incidents in opposite directions — an English sentence flipped to Vietnamese by a
/// curly quote, then a Vietnamese place name flipping an English sentence back — and a Swift copy
/// alongside the TypeScript and the Android ones would drift from them the first time any is
/// corrected. iOS asks `/api/voice/language`; the server answers.
///
/// This is a different question from the one `LocalizationManager.language` answers. That is the
/// APP language and drives voice INPUT: you dictate in the language you chose to work in. This is
/// the MESSAGE language and drives read-aloud, so an English-mode user who receives a Vietnamese
/// reply hears Vietnamese. Conflating the two is the defect this replaces.
enum MessageLanguage: Equatable {
    /// The backend named a language we can speak. `localeTag` is ready for `AVSpeechSynthesisVoice`.
    case speakable(language: String, localeTag: String)
    /// The backend answered, but this reply is in a language we have no voice for. Stay silent.
    case notSpeakable
    /// The call failed. Also stay silent — a network error is not evidence about a language.
    case failed
}

/// Backend language code → iOS BCP-47 tag.
///
/// The mapping lives in exactly one place, so a third language is one entry here plus the server's
/// own config rather than a search for every `"vi-VN"` in the app. Anything unrecognised returns
/// nil and the caller must then not speak.
enum VoiceLocale {
    private static let tags: [String: String] = [
        "vi": "vi-VN",
        "en": "en-US",
    ]

    static func tag(for language: String?) -> String? {
        guard let language, !language.isEmpty else { return nil }
        return tags[language.lowercased()]
    }

    /// The locale voice INPUT should listen in, from the app's UI language.
    /// Separate from `tag(for:)` by intent even though both consult the same table — the two
    /// callers are answering different questions and must not be collapsed into one helper.
    static func inputTag(forAppLanguage language: String) -> String {
        tags[language.lowercased()] ?? "en-US"
    }
}
