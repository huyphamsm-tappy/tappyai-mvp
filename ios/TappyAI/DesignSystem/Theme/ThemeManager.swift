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
}

@MainActor
final class ThemeManager: AppObservableObject {
    @AppPublished var mode: ThemeMode {
        didSet { store.set(mode.rawValue, .theme) }
    }
    private let store: UserDefaultsStore

    init(store: UserDefaultsStore = UserDefaultsStore()) {
        self.store = store
        self.mode = store.string(.theme).flatMap(ThemeMode.init(rawValue:)) ?? .system
    }

    /// Feed into `.preferredColorScheme(...)` at the App-Shell root.
    var preferredColorScheme: ColorScheme? { mode.colorScheme }
}
