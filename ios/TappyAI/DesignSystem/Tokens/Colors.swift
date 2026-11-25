import SwiftUI

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
}

private extension UIColor {
    convenience init(rgb: UInt) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255,
                  green: CGFloat((rgb >> 8) & 0xFF) / 255,
                  blue: CGFloat(rgb & 0xFF) / 255,
                  alpha: 1)
    }
}

/// Brand + semantic color tokens. Adaptive tokens resolve per light/dark via a dynamic `UIColor`.
/// Brand palette matches Android DS (#007AFF / #FF9500). The Reviews feed is intentionally always-dark.
enum TappyColor {
    // Brand
    static let primary = Color(hex: 0x007AFF)
    static let secondary = Color(hex: 0xFF9500)
    static let onPrimary = Color.white
    /// Deliberate dark text on the orange brand color for WCAG contrast (mirrors Android rule).
    static let onSecondary = Color.black

    // Adaptive semantic tokens
    static let background = dynamic(light: 0xFFFFFF, dark: 0x000000)
    static let surface = dynamic(light: 0xF2F2F7, dark: 0x1C1C1E)
    static let surfaceElevated = dynamic(light: 0xFFFFFF, dark: 0x2C2C2E)
    static let textPrimary = dynamic(light: 0x111111, dark: 0xFFFFFF)
    static let textSecondary = dynamic(light: 0x6B7280, dark: 0x9CA3AF)
    static let separator = dynamic(light: 0xE5E7EB, dark: 0x2C2C2E)
    static let border = dynamic(light: 0xE5E7EB, dark: 0x374151)
    static let accent = Color(hex: 0x06B6D4)
    static let cardBackground = dynamic(light: 0xFFFFFF, dark: 0x1C1C1E)
    static let danger = Color(hex: 0xFF3B30)
    static let success = Color(hex: 0x34C759)
    /// Amber. Deliberately neither `success` nor `danger`: it marks a state that needs attention
    /// without asserting fault — the safety gate holding a post is not an accusation, and green
    /// or red would both say something untrue about it.
    static let warning = Color(hex: 0xF59E0B)

    // Reviews feed — locked dark (docs/ios/06)
    static let feedBackground = Color.black
    static let feedTextPrimary = Color.white
    static let feedTextSecondary = Color(hex: 0xEBEBF5, alpha: 0.6)

    static func dynamic(light: UInt, dark: UInt) -> Color {
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
    }
}

/// The Chat screen is ALWAYS dark, like the web (`v3-theme dark`, globals.css `--v3-*`). Fixed colors, not adaptive:
/// added for the chat only; no existing token changes.
enum ChatTheme {
    /// `--v3-bg`
    static let background = Color(hex: 0x0A0F1C)
    /// `--v3-panel` (composer, cards)
    static let panel = Color(hex: 0x111827)
    /// `--v3-border`
    static let border = Color(hex: 0x1F2937)
    /// `--v3-text`
    static let text = Color(hex: 0xF3F4F6)
    /// `--v3-text-secondary`
    static let textSecondary = Color(hex: 0xDCE2EC)
    /// `--v3-interactive`: the person's own bubble
    static let userBubble = Color(hex: 0x0062CC)
    /// The user bubble's corners: the bottom-right one nearly square (web `rounded-br-[4px]`).
    static let userBubbleRadius: CGFloat = 18
    static let userBubbleSquareCorner: CGFloat = 4
    /// Quote / callout block (web ArticleAnswer, dark): orange bar on a dark amber ground.
    static let quoteBar = Color(hex: 0xFF9500)
    static let quoteBackground = Color(hex: 0x2A2113)
}
