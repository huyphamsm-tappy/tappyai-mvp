import SwiftUI

/// 3-question onboarding sheet — matches Web's OnboardingModal.
/// District / Budget / Dietary → POST /api/preferences.
///
/// ============================================================================
/// WHY THE OPTIONS ARE PAIRS AND NOT STRINGS
/// ============================================================================
/// Every option here is TWO things at once: text the user reads, and text that is stored as a
/// free-form preference and later read back by the assistant and shown on the Preferences screen.
/// They were the same Vietnamese string, so an English user picked from a Vietnamese list and had
/// Vietnamese preferences written into their profile.
///
/// Splitting them fixes the display without moving the stored value: `labelKey` is what is shown
/// and follows the app language, `value` is what is sent. District names stay proper nouns.
private struct OnboardingOption: Identifiable, Hashable {
    let value: String
    let labelKey: String
    var id: String { value }
}

struct OnboardingSheet: View {
    let onClose: ([String]) -> Void

    private let districts = [
        OnboardingOption(value: "Quận 1", labelKey: "onboarding.district.q1"),
        OnboardingOption(value: "Quận 3", labelKey: "onboarding.district.q3"),
        OnboardingOption(value: "Bình Thạnh", labelKey: "onboarding.district.binhThanh"),
        OnboardingOption(value: "Thủ Đức", labelKey: "onboarding.district.thuDuc"),
        OnboardingOption(value: "Gò Vấp", labelKey: "onboarding.district.goVap"),
    ]
    private let budgets = [
        OnboardingOption(value: "under50k", labelKey: "onboarding.budget.under50"),
        OnboardingOption(value: "50-100k", labelKey: "onboarding.budget.50to100"),
        OnboardingOption(value: "100-200k", labelKey: "onboarding.budget.100to200"),
        OnboardingOption(value: "over200k", labelKey: "onboarding.budget.over200"),
    ]
    private let dietaryOpts = [
        OnboardingOption(value: "vegetarian", labelKey: "onboarding.diet.vegetarian"),
        OnboardingOption(value: "noSeafood", labelKey: "onboarding.diet.noSeafood"),
        OnboardingOption(value: "noSpice", labelKey: "onboarding.diet.noSpice"),
        OnboardingOption(value: "glutenFree", labelKey: "onboarding.diet.glutenFree"),
        OnboardingOption(value: "none", labelKey: "onboarding.diet.none"),
    ]

    /// The "no restrictions" sentinel, named once so the three places that check it cannot drift.
    private let noneValue = "none"

    @State private var district = ""
    @State private var budget = ""
    @State private var dietary: Set<String> = []
    @State private var customDistrict = ""
    @State private var saving = false

    var body: some View {
        VStack(spacing: Spacing.lg) {
            VStack(spacing: Spacing.xs) {
                Text("🤖")
                    .font(.system(size: 44))
                Text("chat.onboarding.title")
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.textPrimary)
                Text("chat.onboarding.subtitle")
                    .font(TappyFont.footnote)
                    .foregroundStyle(TappyColor.textSecondary)
            }

            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("chat.onboarding.q1")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                chipRow(districts, isSelected: { $0.value == district }) { district = $0.value }
                TextField("onboarding.district.other", text: $customDistrict)
                    .textFieldStyle(.roundedBorder)
                    .font(TappyFont.footnote)

                Text("chat.onboarding.q2")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                chipRow(budgets, isSelected: { $0.value == budget }) { budget = $0.value }

                Text("chat.onboarding.q3")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                chipRow(dietaryOpts, isSelected: { dietary.contains($0.value) }) { toggleDietary($0.value) }
            }

            Button(action: handleSubmit) {
                Text(saving ? "onboarding.saving" : "onboarding.start")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(saving)

            Button("common.skip") { onClose([]) }
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
                .buttonStyle(.plain)
        }
        .padding(Spacing.lg)
    }

    @ViewBuilder
    private func chipRow(
        _ options: [OnboardingOption],
        isSelected: @escaping (OnboardingOption) -> Bool,
        onTap: @escaping (OnboardingOption) -> Void
    ) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(options) { option in
                    chipButton(option.labelKey, selected: isSelected(option)) { onTap(option) }
                }
            }
        }
    }

    @ViewBuilder
    private func chipButton(_ labelKey: LocalizedStringKey, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(labelKey)
                .font(TappyFont.caption)
                .foregroundStyle(selected ? .white : TappyColor.textSecondary)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 6)
                .background(selected ? TappyColor.primary : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.pill, style: .continuous)
                        .stroke(selected ? TappyColor.primary : TappyColor.separator, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func toggleDietary(_ value: String) {
        if value == noneValue {
            dietary = [noneValue]
        } else {
            dietary.remove(noneValue)
            if dietary.contains(value) {
                dietary.remove(value)
            } else {
                dietary.insert(value)
            }
        }
    }

    private func handleSubmit() {
        saving = true
        var prefs: [String] = []
        let loc = !district.isEmpty ? district : customDistrict.trimmingCharacters(in: .whitespaces)
        if !loc.isEmpty {
            prefs.append(String(format: NSLocalizedString("onboarding.pref.area", comment: ""), loc))
        }
        if !budget.isEmpty, let picked = budgets.first(where: { $0.value == budget }) {
            // The stored sentence carries the LABEL, not the internal value: it is free text a
            // person reads back on the Preferences screen and the assistant reads as context, so
            // "under50k" would be meaningless in both places.
            let label = NSLocalizedString(picked.labelKey, comment: "")
            prefs.append(String(format: NSLocalizedString("onboarding.pref.budget", comment: ""), label))
        }
        for value in dietary where value != noneValue {
            guard let picked = dietaryOpts.first(where: { $0.value == value }) else { continue }
            prefs.append(NSLocalizedString(picked.labelKey, comment: ""))
        }
        onClose(prefs)
    }
}
