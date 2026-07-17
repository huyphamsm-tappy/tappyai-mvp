import SwiftUI

/// The 5-tab information architecture from Web (docs/ios/06): Home, Chat, Explore, Deals, Profile.
/// The Explore/Reviews tab owns its own full-screen (locked-dark) experience — the global tab bar
/// is conceptually hidden there, mirroring the web rule. Feature screens are NOT built in Phase 0.
enum AppTab: String, CaseIterable, Identifiable, Hashable {
    case home, chat, explore, deals, profile

    var id: String { rawValue }

    /// Localization key for the tab label (resolved via the String Catalog).
    var titleKey: String { "tab.\(rawValue)" }

    var systemImage: String {
        switch self {
        case .home: return "house"
        case .chat: return "bubble.left.and.bubble.right"
        case .explore: return "play.rectangle"
        case .deals: return "tag"
        case .profile: return "person.crop.circle"
        }
    }

    /// The web route this tab corresponds to (for deep-link mapping only).
    var webPath: String {
        switch self {
        case .home: return "/"
        case .chat: return "/chat"
        case .explore: return "/reviews"
        case .deals: return "/deals"
        case .profile: return "/profile"
        }
    }
}
