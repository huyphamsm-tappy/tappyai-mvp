import SwiftUI

// Inline 18+ prompts shown in the chat error slot (see `AgeGate.swift` for the contract).

/// Guest: the server refused with `age_declaration_required`. Same shape as Android's
/// `GuestAgeDeclaration`: a 4-digit birth year with "Continue", or one tap "I am 18 or older".
struct GuestAgeDeclarationPrompt: View {
    let serverMessage: String?
    let onDeclare: (String) -> Void

    @State private var year = ""
    @FocusState private var focused: Bool

    private var yearValue: String? { GuestAgeDeclaration.value(forBirthYear: year) }

    private func submit() {
        guard let v = yearValue else { return }
        focused = false
        onDeclare(v)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(serverMessage ?? NSLocalizedString("chat.age.declaration.hint", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)

            HStack(spacing: Spacing.xs) {
                TextField(String(localized: "chat.age.declaration.yearPlaceholder"), text: $year)
                    .keyboardType(.numberPad)
                    .focused($focused)
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
                              enabled: yearValue != nil, action: submit)
            }

            AgeGateButton(titleKey: "chat.age.declaration.adult", filled: false, enabled: true) {
                focused = false
                onDeclare(GuestAgeDeclaration.adult)
            }
        }
        // The number pad has no return key: Done and Continue sit above it, so the keyboard can
        // neither trap the user nor cover the button.
        .toolbar {
            if focused {
                ToolbarItemGroup(placement: .keyboard) {
                    Button(NSLocalizedString("common.done", comment: "")) { focused = false }
                    Spacer()
                    Button(NSLocalizedString("chat.age.declaration.continue", comment: ""), action: submit)
                        .disabled(yearValue == nil)
                }
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.primary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

/// What the blocked (`age_ineligible`) panel offers. Guests get none of it: their declaration is
/// local and web offers them no correction either.
struct AgeBlockedState: Equatable {
    var isGuest = true
    var canCorrect = true
    var correcting = false

    var offersCorrection: Bool { !isGuest && canCorrect }
    var showsSupport: Bool { !isGuest && !canCorrect }
}

/// Under 18 (web `AgeCheckView` blocked state): the refusal, then for an account either
/// "I entered the wrong date" or — once the correction is used — the support address.
struct AgeBlockedPanel: View {
    let message: String?
    let state: AgeBlockedState
    let onCorrect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("chat.age.blocked.title")
                .font(TappyFont.bodyEmphasis)
                .foregroundStyle(TappyColor.textPrimary)
            Text(message ?? NSLocalizedString("chat.age.blocked.desc", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
            if state.offersCorrection {
                AgeGateButton(titleKey: "chat.age.correct.cta", filled: false, enabled: true, action: onCorrect)
            } else if state.showsSupport {
                Text("chat.age.blocked.exhausted")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                if let url = URL(string: "mailto:\(AgeGateSupport.email)") {
                    Link(AgeGateSupport.email, destination: url)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.primary)
                }
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

/// Account: the server refused with `age_verification_required` (no date of birth on file), or a
/// blocked account is correcting it. Same fields and rules as web `AgeCheckView`: day, month,
/// year → `PATCH /api/profile`.
struct DateOfBirthPrompt: View {
    enum Mode { case firstEntry, correction }

    let serverMessage: String?
    let submitting: Bool
    let formError: String?
    let onSubmit: (_ day: String, _ month: String, _ year: String) -> Void
    /// Any field changed: the error about the previous attempt is cleared.
    var onEdit: () -> Void = {}
    var mode: Mode = .firstEntry
    var onCancel: (() -> Void)? = nil

    @State private var day = ""
    @State private var month = ""
    @State private var year = ""
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case day, month, year }

    private var canSubmit: Bool { !submitting && !day.isEmpty && !month.isEmpty && year.count == 4 }

    private func submit() {
        guard canSubmit else { return }
        focusedField = nil
        onSubmit(day, month, year)
    }

    private var titleKey: LocalizedStringKey { mode == .correction ? "chat.age.correct.title" : "chat.age.dob.title" }
    private var descKey: String { mode == .correction ? "chat.age.correct.desc" : "chat.age.dob.desc" }
    private var submitKey: LocalizedStringKey {
        submitting ? "chat.age.dob.submitting" : (mode == .correction ? "chat.age.correct.submit" : "chat.age.dob.submit")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(titleKey)
                .font(TappyFont.bodyEmphasis)
                .foregroundStyle(TappyColor.textPrimary)
            Text(serverMessage ?? NSLocalizedString(descKey, comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)

            HStack(spacing: Spacing.xs) {
                field("chat.age.dob.day", text: $day, maxDigits: 2, as: .day)
                field("chat.age.dob.month", text: $month, maxDigits: 2, as: .month)
                field("chat.age.dob.year", text: $year, maxDigits: 4, as: .year)
            }

            if let formError {
                Text(formError)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.danger)
            }

            Text("chat.age.dob.privacy")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            HStack(spacing: Spacing.xs) {
                AgeGateButton(titleKey: submitKey, filled: true, enabled: canSubmit, action: submit)
                if let onCancel {
                    AgeGateButton(titleKey: "common.cancel", filled: false, enabled: !submitting, action: onCancel)
                }
            }
        }
        // The number pad has no return key: Done and Continue sit above it, so the keyboard can
        // neither trap the user nor cover the Continue button.
        .toolbar {
            if focusedField != nil {
                ToolbarItemGroup(placement: .keyboard) {
                    Button(NSLocalizedString("common.done", comment: "")) { focusedField = nil }
                    Spacer()
                    Button(NSLocalizedString(mode == .correction ? "chat.age.correct.submit" : "chat.age.dob.submit",
                                             comment: ""), action: submit)
                        .disabled(!canSubmit)
                }
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.primary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }

    private func field(_ key: String.LocalizationValue, text: Binding<String>, maxDigits: Int, as which: Field) -> some View {
        TextField(String(localized: key), text: text)
            .keyboardType(.numberPad)
            .focused($focusedField, equals: which)
            .font(TappyFont.callout)
            .multilineTextAlignment(.center)
            .padding(.vertical, Spacing.xs)
            .frame(maxWidth: maxDigits == 4 ? 90 : 60)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .onChange(of: text.wrappedValue) { newValue in
                let digits = String(newValue.filter(\.isNumber).prefix(maxDigits))
                if digits != newValue { text.wrappedValue = digits }
                onEdit()
                // A full field moves on to the next one, as on web.
                if digits.count == maxDigits {
                    switch which {
                    case .day: focusedField = .month
                    case .month: focusedField = .year
                    case .year: break
                    }
                }
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
