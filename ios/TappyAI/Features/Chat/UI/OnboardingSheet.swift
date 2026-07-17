import SwiftUI

/// 3-question onboarding sheet — matches Web's OnboardingModal.
/// District / Budget / Dietary → POST /api/preferences.
struct OnboardingSheet: View {
    let onClose: ([String]) -> Void

    private let districts = ["Quận 1", "Quận 3", "Bình Thạnh", "Thủ Đức", "Gò Vấp"]
    private let budgets = ["Dưới 50k", "50–100k", "100–200k", "Trên 200k"]
    private let dietaryOpts = ["Ăn chay", "Không hải sản", "Không cay", "Không gluten", "Không có"]

    @State private var district = ""
    @State private var budget = ""
    @State private var dietary: Set<String> = []
    @State private var customDistrict = ""
    @State private var saving = false

    var body: some View {
        VStack(spacing: Spacing.lg) {
            VStack(spacing: Spacing.xs) {
                Text("🤖").font(.system(size: 48))
                Text("Tappy muốn hiểu bạn hơn!")
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.textPrimary)
                Text("3 câu hỏi nhanh để gợi ý chuẩn hơn.")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("1. Bạn thường ở khu vực nào?")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                FlowLayout(spacing: Spacing.xs) {
                    ForEach(districts, id: \.self) { d in
                        chipButton(d, selected: district == d) {
                            district = district == d ? "" : d
                            customDistrict = ""
                        }
                    }
                }
                TextField("Hoặc nhập khu vực khác...", text: $customDistrict)
                    .font(TappyFont.callout)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.sm)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                            .stroke(TappyColor.separator, lineWidth: 1)
                    )
                    .onChange(of: customDistrict) { district = "" }
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("2. Ngân sách ăn uống/bữa?")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                FlowLayout(spacing: Spacing.xs) {
                    ForEach(budgets, id: \.self) { b in
                        chipButton(b, selected: budget == b) {
                            budget = budget == b ? "" : b
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("3. Có kiêng cữ gì không?")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                FlowLayout(spacing: Spacing.xs) {
                    ForEach(dietaryOpts, id: \.self) { d in
                        chipButton(d, selected: dietary.contains(d)) {
                            toggleDietary(d)
                        }
                    }
                }
            }

            Button(action: handleSubmit) {
                Text(saving ? "⌛ Đang lưu..." : "🎉 Bắt đầu khám phá!")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(saving)

            Button("Bỏ qua") { onClose([]) }
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
                .buttonStyle(.plain)
        }
        .padding(Spacing.lg)
    }

    @ViewBuilder
    private func chipButton(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
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

    private func toggleDietary(_ item: String) {
        if item == "Không có" {
            dietary = ["Không có"]
        } else {
            dietary.remove("Không có")
            if dietary.contains(item) {
                dietary.remove(item)
            } else {
                dietary.insert(item)
            }
        }
    }

    private func handleSubmit() {
        saving = true
        var prefs: [String] = []
        let loc = !district.isEmpty ? district : customDistrict.trimmingCharacters(in: .whitespaces)
        if !loc.isEmpty { prefs.append("Hay ở khu vực \(loc)") }
        if !budget.isEmpty { prefs.append("Ngân sách ăn uống/bữa: \(budget)") }
        dietary.filter { $0 != "Không có" }.forEach { prefs.append($0) }
        onClose(prefs)
    }
}
