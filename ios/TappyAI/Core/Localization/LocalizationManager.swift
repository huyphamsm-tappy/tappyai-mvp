import SwiftUI
import Combine

/// The two supported UI languages (docs/ios/06). AI reply language is auto-detected per message and
/// is independent of this UI locale — do not couple them.
enum AppLanguage: String, CaseIterable, Identifiable, Sendable {
    case vi, en
    var id: String { rawValue }
    var displayName: String { self == .vi ? "Tiếng Việt" : "English" }
    var localeIdentifier: String { rawValue }
}

/// Manages the UI language at runtime (switch without restart) and persists it like the web
/// `localStorage['tappy_lang']`. RTL-ready via `layoutDirection` (vi/en are LTR today).
@MainActor
final class LocalizationManager: AppObservableObject {
    @AppPublished private(set) var language: AppLanguage
    @AppPublished private(set) var hasSelectedLanguage: Bool

    private let store: UserDefaultsStore

    init(store: UserDefaultsStore = UserDefaultsStore()) {
        self.store = store
        let saved = store.string(.language).flatMap(AppLanguage.init(rawValue:))
        self.language = saved ?? Self.systemDefault()
        self.hasSelectedLanguage = store.bool(.hasSeenLanguagePicker)
    }

    func setLanguage(_ language: AppLanguage) {
        self.language = language
        store.set(language.rawValue, .language)
        store.set(true, .hasSeenLanguagePicker)
        hasSelectedLanguage = true
    }

    /// Locale to inject into the SwiftUI environment for runtime switching.
    var locale: Locale { Locale(identifier: language.localeIdentifier) }

    /// LTR for both supported languages; wired now so future RTL locales need no structural change.
    var layoutDirection: LayoutDirection { .leftToRight }

    private static func systemDefault() -> AppLanguage {
        let code = Locale.preferredLanguages.first?.prefix(2).lowercased()
        return code == "vi" ? .vi : .en
    }
}
