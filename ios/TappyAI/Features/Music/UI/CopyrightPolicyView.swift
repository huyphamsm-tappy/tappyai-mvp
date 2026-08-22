import SwiftUI

/// The music copyright / notice-and-takedown policy — the native counterpart of the web's
/// `/copyright`.
///
/// ============================================================================
/// WHY A NATIVE SCREEN AND NOT A LINK OUT
/// ============================================================================
/// This is the policy a user agrees to by uploading an Original Sound, and the address a rights
/// holder is told to write to. Both are obligations of the app, so both have to be readable inside
/// it — on a plane, in the uploader, before the upload. The other legal screens (`PrivacyPolicyView`,
/// `TermsOfServiceView`) are native for the same reason and this one was simply missing.
///
/// Static text: nothing here loads, so there is no loading, empty or error state to design. The
/// English and Vietnamese wordings both live in the catalogue rather than in this file — the web
/// version is hardcoded Vietnamese, which is the defect this does not repeat.
struct CopyrightPolicyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text("copyright.heading")
                        .font(TappyFont.title)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("copyright.scope")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                }

                section(titleKey: "copyright.s1.title", bodyKey: "copyright.s1.body")
                section(titleKey: "copyright.s2.title", bodyKey: "copyright.s2.body")
                section(titleKey: "copyright.s3.title", bodyKey: "copyright.s3.body")
                section(titleKey: "copyright.s3.title", bodyKey: "copyright.s3.sla", showTitle: false)

                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("copyright.s4.title")
                        .font(TappyFont.headline)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("copyright.s4.body")
                        .font(TappyFont.body)
                        .foregroundStyle(TappyColor.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    // The one interactive element: a rights holder reading this needs to be able
                    // to act on it, and retyping an address from a screen is where complaints get
                    // lost. `verbatim` because an email address is not translated.
                    if let url = URL(string: "mailto:\(Self.copyrightAgentEmail)") {
                        Link(destination: url) {
                            Text(verbatim: Self.copyrightAgentEmail)
                                .font(TappyFont.body)
                                .foregroundStyle(TappyColor.primary)
                        }
                        .accessibilityLabel(Text("copyright.s4.emailAccessibility"))
                    }
                }

                section(titleKey: "copyright.s5.title", bodyKey: "copyright.s5.body")
            }
            .padding(Spacing.md)
            .padding(.bottom, Spacing.xl)
        }
        .navigationTitle(Text("copyright.title"))
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Kept in one place so the screen and any future report flow cannot drift apart. Matches the
    /// address published on the web policy page.
    static let copyrightAgentEmail = "copyright@tappyai.com"

    @ViewBuilder
    private func section(titleKey: String, bodyKey: String, showTitle: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if showTitle {
                Text(LocalizedStringKey(titleKey))
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.textPrimary)
            }
            Text(LocalizedStringKey(bodyKey))
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
