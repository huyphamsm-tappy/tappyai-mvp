import SwiftUI

// Inline 18+ prompts shown in the chat error slot (see `AgeGate.swift` for the contract).

/// Guest: the server refused with `age_declaration_required`. Same shape as Android's
/// `GuestAgeDeclaration`: a 4-digit birth year with "Continue", or one tap "I am 18 or older".
struct GuestAgeDeclarationPrompt: View {
    let serverMessage: String?
    let onDeclare: (String) -> Void

    @State private var year = ""

    private var yearValue: String? { GuestAgeDeclaration.value(forBirthYear: year) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(serverMessage ?? NSLocalizedString("chat.age.declaration.hint", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)

            HStack(spacing: Spacing.xs) {
                TextField(String(localized: "chat.age.declaration.yearPlaceholder"), text: $year)
                    .keyboardType(.numberPad)
                    .font(TappyFont.callout)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xs)
                    .frame(maxWidth: 120)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .onChange(of: year) { newValue in
                        let digits = String(newValue.filter(\.isNumber).prefix(4))
                        if digits != newValue { year = digits }
                    }

                AgeGateButton(titleKey: "chat.age.declaration.continue", filled: true,
                              enabled: yearValue != nil) {
                    if let v = yearValue { onDeclare(v) }
                }
            }

            AgeGateButton(titleKey: "chat.age.declaration.adult", filled: false, enabled: true) {
                onDeclare(GuestAgeDeclaration.adult)
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.primary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

/// Account: the server refused with `age_verification_required` (no date of birth on file).
/// Same fields and rules as web `AgeCheckView`: day, month, year → `PATCH /api/profile`.
struct DateOfBirthPrompt: View {
    let serverMessage: String?
    let submitting: Bool
    let formError: String?
    let onSubmit: (_ day: String, _ month: String, _ year: String) -> Void

    @State private var day = ""
    @State private var month = ""
    @State private var year = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("chat.age.dob.title")
                .font(TappyFont.bodyEmphasis)
                .foregroundStyle(TappyColor.textPrimary)
            Text(serverMessage ?? NSLocalizedString("chat.age.dob.desc", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)

            HStack(spacing: Spacing.xs) {
                field("chat.age.dob.day", text: $day, maxDigits: 2)
                field("chat.age.dob.month", text: $month, maxDigits: 2)
                field("chat.age.dob.year", text: $year, maxDigits: 4)
            }

            if let formError {
                Text(formError)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.danger)
            }

            Text("chat.age.dob.privacy")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            AgeGateButton(titleKey: submitting ? "chat.age.dob.submitting" : "chat.age.dob.submit",
                          filled: true,
                          enabled: !submitting && !day.isEmpty && !month.isEmpty && year.count == 4) {
                onSubmit(day, month, year)
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.primary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }

    private func field(_ key: String.LocalizationValue, text: Binding<String>, maxDigits: Int) -> some View {
        TextField(String(localized: key), text: text)
            .keyboardType(.numberPad)
            .font(TappyFont.callout)
            .multilineTextAlignment(.center)
            .padding(.vertical, Spacing.xs)
            .frame(maxWidth: maxDigits == 4 ? 90 : 60)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .onChange(of: text.wrappedValue) { newValue in
                let digits = String(newValue.filter(\.isNumber).prefix(maxDigits))
                if digits != newValue { text.wrappedValue = digits }
            }
    }
}

private struct AgeGateButton: View {
    let titleKey: LocalizedStringKey
    let filled: Bool
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(titleKey)
                .font(TappyFont.caption)
                .foregroundStyle(filled ? .white : TappyColor.primary)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, Spacing.xs)
                .background(filled ? TappyColor.primary : Color.clear)
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .stroke(TappyColor.primary, lineWidth: filled ? 0 : 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.5)
    }
}
