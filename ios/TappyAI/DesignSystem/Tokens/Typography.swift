import SwiftUI

/// Type tokens built on the system font + text styles so **Dynamic Type** scaling is automatic
/// (an accessibility default, not an add-on). Use these instead of ad-hoc `.font(.system(...))`.
enum TappyFont {
    static func scaled(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .default).weight(weight)
    }

    static let largeTitle = scaled(.largeTitle, weight: .bold)
    static let title = scaled(.title2, weight: .semibold)
    static let headline = scaled(.headline, weight: .semibold)
    static let body = scaled(.body)
    static let bodyEmphasis = scaled(.body, weight: .semibold)
    static let callout = scaled(.callout)
    static let footnote = scaled(.footnote)
    static let caption = scaled(.caption)
    static let button = scaled(.body, weight: .semibold)
}
