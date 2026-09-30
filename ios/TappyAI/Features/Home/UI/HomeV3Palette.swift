import SwiftUI

/// The V3 Home palette (Android `HomeV3.kt`): the approved dark master mockup in dark mode, the app's
/// own light greys in light mode; the accents (purple / blue / orange) are the identity and only
/// shift in tone. Scoped to Home — the rest of the app keeps `TappyColor`.
enum HomeV3 {
    static let background = TappyColor.dynamic(light: 0xF8FAFC, dark: 0x050814)
    static let surface = TappyColor.dynamic(light: 0xFFFFFF, dark: 0x0F1730)
    static let surfaceVariant = TappyColor.dynamic(light: 0xF1F5F9, dark: 0x18213D)
    static let purple = TappyColor.dynamic(light: 0x6B47FF, dark: 0x7C5CFF)
    static let blue = TappyColor.dynamic(light: 0x1877E8, dark: 0x3391FF)
    static let onSurface = TappyColor.dynamic(light: 0x0F172A, dark: 0xEEF1FB)
    static let onSurfaceVariant = TappyColor.dynamic(light: 0x475569, dark: 0x98A2C4)
    static let outline = TappyColor.dynamic(light: 0xE2E8F0, dark: 0x26314F)
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
