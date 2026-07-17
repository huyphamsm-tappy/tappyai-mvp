import SwiftUI

/// Accessibility defaults and helpers. Dynamic Type is on by default because the type tokens use
/// system text styles (see Typography). These helpers keep interactive elements labeled and sized.
extension View {
    /// Treat a composed view as a single, labeled button for VoiceOver.
    func tappyAccessibleButton(_ label: LocalizedStringKey) -> some View {
        self.accessibilityElement(children: .combine)
            .accessibilityLabel(Text(label))
            .accessibilityAddTraits(.isButton)
    }

    /// Guarantee a 44×44pt hit target and mark as a button.
    func tappyTappable(_ label: LocalizedStringKey) -> some View {
        self.minimumTapTarget().contentShape(Rectangle()).tappyAccessibleButton(label)
    }
}
