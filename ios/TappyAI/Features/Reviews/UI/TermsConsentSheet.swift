import SwiftUI

/// "Before you post": the community rules in one screen, a link to the full Terms, Agree / Cancel.
struct TermsConsentSheet: View {
    let onAccept: () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    Text("ugc.terms.body")
                        .font(.system(size: 14))
                        .foregroundStyle(TappyColor.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        rule("ugc.terms.rule1")
                        rule("ugc.terms.rule2")
                        rule("ugc.terms.rule3")
                    }

                    NavigationLink {
                        TermsOfServiceView()
                    } label: {
                        Label {
                            Text("ugc.terms.readFull")
                        } icon: {
                            Image(systemName: "doc.text")
                        }
                        .font(.system(size: 14, weight: .semibold))
                    }

                    Button(action: onAccept) {
                        Text("ugc.terms.agree")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 46)
                            .foregroundStyle(.white)
                            .background(TappyColor.primary)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, Spacing.sm)
                }
                .padding(Spacing.lg)
            }
            .background(TappyColor.background)
            .navigationTitle(Text("ugc.terms.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common.cancel", comment: ""), action: onCancel)
                }
            }
        }
    }

    private func rule(_ key: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: Spacing.xs) {
            Image(systemName: "checkmark.shield")
                .foregroundStyle(TappyColor.primary)
            Text(key)
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
