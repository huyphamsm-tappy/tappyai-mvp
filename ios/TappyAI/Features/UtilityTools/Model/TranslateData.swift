import Foundation

struct LanguageOption: Identifiable {
    let code: String
    let name: String

    var id: String { code }
}

let supportedLanguages: [LanguageOption] = [
    LanguageOption(code: "vi", name: "Tiếng Việt"),
    LanguageOption(code: "en", name: "English"),
    LanguageOption(code: "ja", name: "日本語"),
    LanguageOption(code: "ko", name: "한국어"),
    LanguageOption(code: "zh-CN", name: "中文（简体）"),
    LanguageOption(code: "zh-TW", name: "中文（繁體）"),
    LanguageOption(code: "fr", name: "Français"),
    LanguageOption(code: "de", name: "Deutsch"),
    LanguageOption(code: "es", name: "Español"),
    LanguageOption(code: "it", name: "Italiano"),
    LanguageOption(code: "pt", name: "Português"),
    LanguageOption(code: "ar", name: "العربية"),
    LanguageOption(code: "th", name: "ภาษาไทย"),
    LanguageOption(code: "id", name: "Bahasa Indonesia"),
    LanguageOption(code: "ms", name: "Bahasa Melayu"),
    LanguageOption(code: "hi", name: "हिंदी"),
    LanguageOption(code: "ru", name: "Русский"),
    LanguageOption(code: "nl", name: "Nederlands"),
    LanguageOption(code: "pl", name: "Polski"),
    LanguageOption(code: "tr", name: "Türkçe"),
    LanguageOption(code: "sv", name: "Svenska"),
    LanguageOption(code: "da", name: "Dansk"),
    LanguageOption(code: "no", name: "Norsk"),
    LanguageOption(code: "fi", name: "Suomi"),
    LanguageOption(code: "cs", name: "Čeština"),
    LanguageOption(code: "hu", name: "Magyar"),
    LanguageOption(code: "ro", name: "Română"),
    LanguageOption(code: "el", name: "Ελληνικά"),
    LanguageOption(code: "he", name: "עברית"),
    LanguageOption(code: "uk", name: "Українська"),
]
