import SwiftUI

/// The V3 Home palette (Android `HomeV3.kt`): the approved dark master mockup in dark mode, the app's
/// own light greys in light mode; the accents (purple / blue / orange) are the identity and only
/// shift in tone. Scoped to Home — the rest of the app keeps `TappyColor`.
enum HomeV3 {
    // Values are the web's --v3-* tokens (globals.css): page, panel, panel-elevated, violet, accent,
    // fg, fg-secondary, border — light / dark.
    static let background = TappyColor.dynamic(light: 0xF5F7FA, dark: 0x0A0F1C)
    static let surface = TappyColor.dynamic(light: 0xFFFFFF, dark: 0x111827)
    static let surfaceVariant = TappyColor.dynamic(light: 0xEEF1F6, dark: 0x161F32)
    static let purple = TappyColor.dynamic(light: 0x6D28D9, dark: 0x8B5CF6)
    static let blue = TappyColor.dynamic(light: 0x0069DB, dark: 0x3391FF)
    static let onSurface = TappyColor.dynamic(light: 0x111827, dark: 0xF3F4F6)
    static let onSurfaceVariant = TappyColor.dynamic(light: 0x4B5563, dark: 0xDCE2EC)
    static let outline = TappyColor.dynamic(light: 0xE3E8EF, dark: 0x1F2937)
    static let brandSpark = Color(hex: 0xFF9500)
    static let statusGreen = Color(hex: 0x34D399)

    static var heroGlow: Color { Color(hex: 0x3391FF, alpha: 0.28) }

    /// The primary AI action's sweep: purple → blue.
    static var actionGradient: LinearGradient {
        LinearGradient(colors: [purple, blue], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    static func gradient(_ a: UInt, _ b: UInt) -> LinearGradient {
        LinearGradient(colors: [Color(hex: a), Color(hex: b)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
