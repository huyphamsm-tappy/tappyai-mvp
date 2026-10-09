import SwiftUI

/// The agreement shown on the login and registration screens (App Review 1.2). Nothing is signed in or
/// created until the box is ticked. The links open the published Terms (in app) and Community Guidelines.
struct AuthTermsConsentView: View {
    @Binding var agreed: Bool
    @State private var showTerms = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Button { agreed.toggle() } label: {
                HStack(alignment: .top, spacing: Spacing.xs) {
                    Image(systemName: agreed ? "checkmark.square.fill" : "square")
                        .font(.system(size: 22))
                        .foregroundStyle(agreed ? TappyColor.primary : TappyColor.textSecondary)
                    Text("auth.terms.agree")
                        .font(TappyFont.footnote)
                        .foregroundStyle(TappyColor.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("auth-terms-checkbox")
            .accessibilityValue(Text(LocalizedStringKey(agreed ? "auth.terms.checked" : "auth.terms.unchecked")))

            HStack(spacing: Spacing.md) {
                Button { showTerms = true } label: { Text("auth.terms.linkTerms") }
                    .accessibilityIdentifier("auth-terms-link")
                if let url = URL(string: TappyShare.canonicalOrigin + "/community-guidelines") {
                    Link(destination: url) { Text("auth.terms.linkGuidelines") }
                        .accessibilityIdentifier("auth-guidelines-link")
                }
            }
            .font(TappyFont.footnote.weight(.semibold))
            .padding(.leading, 22 + Spacing.xs)

            Text("auth.terms.zeroTolerance")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 22 + Spacing.xs)
        }
        .sheet(isPresented: $showTerms) {
            NavigationStack {
                TermsOfServiceView()
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(NSLocalizedString("common.close", comment: "")) { showTerms = false }
                        }
                    }
            }
        }
    }
}
