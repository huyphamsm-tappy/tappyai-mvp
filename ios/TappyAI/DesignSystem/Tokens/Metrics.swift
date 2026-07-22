import SwiftUI

/// Spacing scale (pt). Use tokens instead of magic numbers for layout consistency across screens.
enum Spacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
}

/// Corner radius scale.
enum Radius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 20
    static let xl: CGFloat = 24
    static let pill: CGFloat = 999
}

/// Elevation (shadow) tokens. Kept subtle, iOS-idiomatic.
enum Elevation {
    struct Shadow { let color: Color; let radius: CGFloat; let x: CGFloat; let y: CGFloat }
    static let none = Shadow(color: .clear, radius: 0, x: 0, y: 0)
    static let low = Shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
    static let medium = Shadow(color: .black.opacity(0.12), radius: 14, x: 0, y: 6)
}

extension View {
    func tappyShadow(_ shadow: Elevation.Shadow) -> some View {
        self.shadow(color: shadow.color, radius: shadow.radius, x: shadow.x, y: shadow.y)
    }
    /// Minimum 44×44pt hit target (HIG).
    func minimumTapTarget() -> some View {
        frame(minWidth: 44, minHeight: 44)
    }
}
