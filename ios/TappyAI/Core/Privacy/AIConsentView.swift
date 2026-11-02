import SwiftUI

/// Presents the sheet while the coordinator says so (an `ObservedObject`, so the nested object's changes redraw it).
struct AIConsentSheet: ViewModifier {
    @ObservedObject var consent: AIConsentCoordinator
    func body(content: Content) -> some View {
        content.sheet(isPresented: Binding(get: { consent.isPresenting }, set: { _ in })) {
            AIConsentView(consent: consent)
        }
    }
}

/// The one-time «share data with AI» sheet. Plain words: what leaves the phone, to whom, why, and how to stop.
struct AIConsentView: View {
    @ObservedObject var consent: AIConsentCoordinator

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    Image("TappyWave").resizable().scaledToFit().frame(height: 120).frame(maxWidth: .infinity)
                    Text("ai.consent.title").font(TappyFont.title).foregroundStyle(TappyColor.textPrimary)
                    Text("ai.consent.intro").font(TappyFont.body).foregroundStyle(TappyColor.textPrimary)
                    point("ai.consent.what.title", "ai.consent.what.body", "text.bubble")
                    point("ai.consent.who.title", "ai.consent.who.body", "building.2")
                    point("ai.consent.why.title", "ai.consent.why.body", "sparkles")
                    point("ai.consent.how.title", "ai.consent.how.body", "lock.shield")
                    point("ai.consent.later.title", "ai.consent.later.body", "slider.horizontal.3")
                    if let url = URL(string: "https://www.tappyai.com/privacy") {
                        Link(destination: url) {
                            Label { Text("ai.consent.privacy") } icon: { Image(systemName: "arrow.up.right.square") }
                                .font(TappyFont.callout)
                        }
                        .accessibilityIdentifier("ai-consent-privacy")
                    }
                }
                .padding(Spacing.lg)
            }
            VStack(spacing: Spacing.xs) {
                Button { consent.agree() } label: {
                    Text("ai.consent.agree").font(TappyFont.bodyEmphasis).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(TappyColor.primary)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ai-consent-agree")
                Button { consent.later() } label: {
                    Text("ai.consent.later").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ai-consent-later")
            }
            .padding(Spacing.lg)
            .background(TappyColor.background)
        }
        .background(TappyColor.background)
        .interactiveDismissDisabled()
    }

    private func point(_ title: LocalizedStringKey, _ body: LocalizedStringKey, _ icon: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(TappyColor.primary).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                Text(body).font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
            }
        }
    }
}
