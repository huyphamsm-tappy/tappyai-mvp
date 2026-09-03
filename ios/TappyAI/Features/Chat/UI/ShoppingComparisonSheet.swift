import SwiftUI

/// P4-07 — comparison on iOS, presented as a SHEET (DD-005).
///
/// Same semantic contract as web and Android: at most four entities, at most six differing
/// attributes, identical rows folded away, an unknown value stated as unknown, and a recommendation
/// that always carries its reason. The container differs, and here it must — a four-column grid
/// inside a phone-width thread is unreadable — which is exactly what the parity contract puts in
/// MAY DIFFER.
struct ShoppingComparisonSheet: View {
    let comparison: ShoppingComparison
    let onDismiss: () -> Void

    private var split: (differing: [ComparisonAttribute], identical: [ComparisonAttribute]) {
        partitionComparisonAttributes(entities: comparison.entities, attributes: comparison.attributes)
    }

    var body: some View {
        let parts = split
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    // The grid scrolls sideways inside the sheet; the sheet itself never does.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: Spacing.md) {
                            // Pinned attribute column, so a row keeps its meaning while values scroll.
                            VStack(alignment: .leading, spacing: Spacing.md) {
                                Text(String(localized: "comparison.attribute"))
                                    .font(TappyFont.caption)
                                    .foregroundStyle(TappyColor.textSecondary)
                                ForEach(parts.differing) { attr in
                                    Text(attr.label)
                                        .font(TappyFont.caption)
                                        .foregroundStyle(TappyColor.textSecondary)
                                }
                            }
                            .frame(width: 104, alignment: .leading)

                            ForEach(comparison.entities) { entity in
                                VStack(alignment: .leading, spacing: Spacing.md) {
                                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                                        Text(entity.label)
                                            .font(TappyFont.bodyEmphasis)
                                            .foregroundStyle(TappyColor.textPrimary)
                                            .lineLimit(2)
                                        if entity.key == comparison.recommendedKey {
                                            // Text, not just a tint — the mark must survive
                                            // greyscale and VoiceOver alike.
                                            Text("✓ " + String(localized: "comparison.recommended"))
                                                .font(TappyFont.caption)
                                                .foregroundStyle(TappyColor.primary)
                                                .padding(.horizontal, Spacing.xs)
                                                .padding(.vertical, 2)
                                                .background(TappyColor.primary.opacity(0.12))
                                                .clipShape(Capsule())
                                        }
                                    }
                                    ForEach(parts.differing) { attr in
                                        let value = entity.values[attr.key] ?? nil
                                        Text(value ?? String(localized: "comparison.unknown"))
                                            .font(TappyFont.body)
                                            // An unknown reads as unknown — italic and muted,
                                            // never blank.
                                            .italic(value == nil)
                                            .foregroundStyle(value == nil ? TappyColor.textSecondary : TappyColor.textPrimary)
                                    }
                                }
                                .frame(width: 132, alignment: .leading)
                            }
                        }
                        .padding(.horizontal, Spacing.md)
                    }

                    if !parts.identical.isEmpty {
                        Text(String(localized: "comparison.sameForAll") + ": "
                             + parts.identical.map(\.label).joined(separator: " · "))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                            .padding(.horizontal, Spacing.md)
                    }

                    if let reason = comparison.reason {
                        Divider()
                        Text(String(localized: "comparison.reason") + ": " + reason)
                            .font(TappyFont.body)
                            .foregroundStyle(TappyColor.textPrimary)
                            .padding(.horizontal, Spacing.md)
                    }
                }
                .padding(.vertical, Spacing.md)
            }
            .navigationTitle(Text("comparison.titleShort"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "comparison.collapse"), action: onDismiss)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// P4-07 — confirmation on iOS, presented as a SHEET (DD-006).
///
/// The visible action boundary: the user decides, the Controller executes. Swipe-to-dismiss
/// resolves to CANCEL — there is no path where letting go of the sheet performs the action, so an
/// abandoned prompt fails closed exactly as on web and Android.
struct ConfirmationSheet: View {
    let consequence: String
    var changes: [String] = []
    var confirmLabel: String? = nil
    var destructive: Bool = false
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text(consequence)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)

            if !changes.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text(String(localized: "confirm.whatChanges"))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    ForEach(changes, id: \.self) { change in
                        Text("· \(change)")
                            .font(TappyFont.body)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }

            Button(action: onConfirm) {
                Text(confirmLabel ?? String(localized: "confirm.confirm"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(destructive ? TappyColor.danger : TappyColor.primary)
            .minimumTapTarget()

            Button(String(localized: "confirm.cancel"), action: onCancel)
                .frame(maxWidth: .infinity)
                .minimumTapTarget()
        }
        .padding(Spacing.md)
        .presentationDetents([.height(260), .medium])
        // Dismissing by swipe or scrim is a cancel, never a confirm.
        .interactiveDismissDisabled(false)
    }
}
