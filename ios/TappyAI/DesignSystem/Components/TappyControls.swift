import SwiftUI

enum TappyButtonVariant { case primary, secondary, tertiary, destructive }

/// Brand button style. Native `Button` + `ButtonStyle` (HIG), 44pt min height, Dynamic Type,
/// pressed feedback. Use: `Button("Save") { }.buttonStyle(.tappy(.primary))`.
struct TappyButtonStyle: ButtonStyle {
    let variant: TappyButtonVariant
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TappyFont.button)
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, Spacing.lg)
            .background(background(pressed: configuration.isPressed))
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .overlay(border)
            .opacity(isEnabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var foreground: Color {
        switch variant {
        case .primary: return TappyColor.onPrimary
        case .secondary: return TappyColor.onSecondary
        case .tertiary: return TappyColor.primary
        case .destructive: return TappyColor.onPrimary
        }
    }
    private func background(pressed: Bool) -> Color {
        let base: Color
        switch variant {
        case .primary: base = TappyColor.primary
        case .secondary: base = TappyColor.secondary
        case .tertiary: base = .clear
        case .destructive: base = TappyColor.danger
        }
        return pressed ? base.opacity(0.85) : base
    }
    @ViewBuilder private var border: some View {
        if variant == .tertiary {
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .stroke(TappyColor.separator, lineWidth: 1)
        }
    }
}

extension ButtonStyle where Self == TappyButtonStyle {
    static func tappy(_ variant: TappyButtonVariant = .primary) -> TappyButtonStyle {
        TappyButtonStyle(variant: variant)
    }
}

/// Themed text field with an optional label. Secure mode for passwords/OTP.
struct TappyTextField: View {
    let titleKey: LocalizedStringKey
    @Binding var text: String
    var isSecure: Bool = false

    var body: some View {
        Group {
            if isSecure { SecureField(titleKey, text: $text) }
            else { TextField(titleKey, text: $text) }
        }
        .font(TappyFont.body)
        .padding(Spacing.sm)
        .frame(minHeight: 44)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
                .stroke(TappyColor.separator, lineWidth: 1)
        )
    }
}
