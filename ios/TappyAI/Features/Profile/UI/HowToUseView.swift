import SwiftUI

/// "How to use TappyAI" — feature usage guidance, the native counterpart of the web's
/// `/how-to-use` page and of Android's `HowToUseScreen`.
///
/// Every user-visible string is a `LocalizedStringKey` resolved from `Localizable.xcstrings`,
/// deliberately NOT `String(localized:)`. The two are not interchangeable here: `String(localized:)`
/// resolves once against the bundle's locale, while `LocalizedStringKey` is resolved by SwiftUI
/// through the environment — and `AppRootView` sets `.environment(\.locale, localization.locale)`
/// from `LocalizationManager`. Only the environment-resolved form follows the in-app language
/// picker; the other would leave this screen stuck on the system language while the rest of the app
/// switched.
///
/// This is also why the sibling `StaticPageView` is not reused: its sections take plain `String`
/// and its titles are hardcoded Vietnamese. Fixing that is a separate, pre-existing i18n job — this
/// screen carries its own small section builder rather than dragging that rewrite into scope.
struct HowToUseView: View {

    /// One titled section. `steps` render as a real numbered list so the order reads as order.
    private struct Section: Identifiable {
        let id: String
        let title: LocalizedStringKey
        let intro: LocalizedStringKey
        let steps: [LocalizedStringKey]
        let outcome: LocalizedStringKey?
        let note: LocalizedStringKey
    }

    private let sections: [Section] = [
        Section(
            id: "chat",
            title: "guide.chat.title",
            intro: "guide.chat.intro",
            steps: ["guide.chat.step1", "guide.chat.step2", "guide.chat.step3", "guide.chat.step4"],
            outcome: "guide.chat.outcome",
            note: "guide.chat.note"
        ),
        Section(
            id: "food",
            title: "guide.food.title",
            intro: "guide.food.intro",
            steps: ["guide.food.step1", "guide.food.step2", "guide.food.step3"],
            outcome: "guide.food.outcome",
            note: "guide.food.note"
        ),
        Section(
            id: "travel",
            title: "guide.travel.title",
            intro: "guide.travel.intro",
            steps: ["guide.travel.step1", "guide.travel.step2", "guide.travel.step3"],
            outcome: "guide.travel.outcome",
            note: "guide.travel.note"
        ),
        Section(
            id: "product",
            title: "guide.product.title",
            intro: "guide.product.intro",
            steps: ["guide.product.step1", "guide.product.step2", "guide.product.step3"],
            outcome: "guide.product.outcome",
            note: "guide.product.note"
        ),
        Section(
            id: "readaloud",
            title: "guide.readaloud.title",
            intro: "guide.readaloud.intro",
            steps: ["guide.readaloud.step1", "guide.readaloud.step2", "guide.readaloud.step3"],
            outcome: nil,
            note: "guide.readaloud.note"
        ),
        Section(
            id: "notifications",
            title: "guide.notifications.title",
            intro: "guide.notifications.intro",
            steps: ["guide.notifications.step1", "guide.notifications.step2", "guide.notifications.step3"],
            outcome: nil,
            note: "guide.notifications.note"
        ),
        Section(
            id: "tappysound",
            title: "guide.tappysound.title",
            intro: "guide.tappysound.intro",
            steps: [],
            outcome: nil,
            note: "guide.tappysound.note"
        ),
        Section(
            id: "reviews",
            title: "guide.reviews.title",
            intro: "guide.reviews.intro",
            steps: ["guide.reviews.step1", "guide.reviews.step2", "guide.reviews.step3"],
            outcome: nil,
            note: "guide.reviews.note"
        ),
        Section(
            id: "saves",
            title: "guide.saves.title",
            intro: "guide.saves.intro",
            steps: ["guide.saves.step1", "guide.saves.step2"],
            outcome: nil,
            note: "guide.saves.note"
        ),
        Section(
            id: "tools",
            title: "guide.tools.title",
            intro: "guide.tools.intro",
            steps: ["guide.tools.scan", "guide.tools.translate", "guide.tools.currency", "guide.tools.splitbill"],
            outcome: nil,
            note: "guide.tools.note"
        ),
        Section(
            id: "account",
            title: "guide.account.title",
            intro: "guide.account.intro",
            steps: ["guide.account.guest", "guide.account.signedin"],
            outcome: nil,
            note: "guide.account.note"
        ),
        Section(
            id: "limits",
            title: "guide.limits.title",
            intro: "guide.limits.intro",
            steps: ["guide.limits.b1", "guide.limits.b2", "guide.limits.b3", "guide.limits.b4"],
            outcome: nil,
            note: "guide.limits.note"
        ),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                Text("guide.intro")
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                ForEach(sections) { section in
                    sectionView(section)
                }
            }
            .padding(Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle("guide.title")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func sectionView(_ section: Section) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(section.title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
                // Headings are marked as such so VoiceOver's rotor can jump between them
                // instead of forcing a linear read of the whole document.
                .accessibilityAddTraits(.isHeader)

            Text(section.intro)
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(section.steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: Spacing.xs) {
                    Text("\(index + 1).")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(TappyColor.textSecondary)
                    Text(step)
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                // Read as one unit, so VoiceOver says "1. Open Chat…" rather than
                // announcing the bare numeral as a separate element.
                .accessibilityElement(children: .combine)
            }

            if let outcome = section.outcome {
                Text(outcome)
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(section.note)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(TappyColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
