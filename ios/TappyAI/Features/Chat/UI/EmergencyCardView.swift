import SwiftUI

/// The web's emergency card (`tappy.safety.v1`): the verified hotlines of a dangerous situation, each with a button that dials it.
/// The reply's text already lists the same numbers; this card makes them one tap.
struct EmergencyCardView: View {
    let cards: [EmergencyCardItem]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("safety.emergency.cardsTitle")
                .font(TappyFont.footnote.weight(.semibold))
                .foregroundStyle(TappyColor.danger)
                .accessibilityAddTraits(.isHeader)
            ForEach(cards) { card in
                row(card)
            }
        }
        .padding(Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityIdentifier("emergency-card")
    }

    @ViewBuilder
    private func row(_ card: EmergencyCardItem) -> some View {
        HStack(spacing: Spacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(card.displayName)
                    .font(TappyFont.callout.weight(.semibold))
                    .foregroundStyle(TappyColor.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = Self.detail(hours: card.operatingHours, free: card.freeOfCharge) {
                    Text(detail)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
            Spacer(minLength: Spacing.xs)
            if let url = card.telURL {
                Button { UIApplication.shared.open(url) } label: {
                    Label(card.phoneNumber, systemImage: "phone.fill")
                        .font(TappyFont.callout.weight(.bold))
                }
                .buttonStyle(.borderedProminent)
                .tint(TappyColor.danger)
                .accessibilityLabel(Text(verbatim: card.displayName + " " + card.phoneNumber))
                .accessibilityIdentifier("emergency-call-" + card.phoneNumber)
            }
        }
    }

    /// "Trực 24/7 · Miễn phí" — the hours and the cost the server stated, never anything else (an unstated one is not guessed).
    static func detail(hours: String?, free: Bool) -> String? {
        var parts: [String] = []
        if let hours, !hours.isEmpty { parts.append(String(format: NSLocalizedString("safety.emergency.hours", comment: ""), hours)) }
        if free { parts.append(NSLocalizedString("safety.emergency.free", comment: "")) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
