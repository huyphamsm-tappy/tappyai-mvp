import SwiftUI
import Combine

/// Light / Dark / System with runtime switching. Persisted like the web `localStorage['theme']`.
/// The App-Shell honors this; the Reviews feed remains dark regardless (docs/ios/06).
enum ThemeMode: String, CaseIterable, Identifiable, Sendable {
    case system, light, dark
    var id: String { rawValue }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
    var titleKey: String { "theme.\(rawValue)" }

    /// DARK until the person chooses otherwise — the same default as the web (`localStorage.theme !== 'light'`),
    /// so a first launch looks like the web on the same phone. A stored choice (system / light / dark) always wins.
    static let defaultMode: ThemeMode = .dark

    static func resolve(stored: String?) -> ThemeMode {
        stored.flatMap(ThemeMode.init(rawValue:)) ?? defaultMode
    }
}

@MainActor
final class ThemeManager: AppObservableObject {
    @AppPublished var mode: ThemeMode {
        didSet { store.set(mode.rawValue, .theme) }
    }
    private let store: UserDefaultsStore

    init(store: UserDefaultsStore = UserDefaultsStore()) {
        self.store = store
        self.mode = ThemeMode.resolve(stored: store.string(.theme))
    }

    /// Feed into `.preferredColorScheme(...)` at the App-Shell root.
    var preferredColorScheme: ColorScheme? { mode.colorScheme }
}
