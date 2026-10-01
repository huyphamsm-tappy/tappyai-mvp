import SwiftUI

/// In-app account deletion — iOS counterpart of web `DeleteAccountView`
/// (`src/app/(app)/profile/settings/delete-account/`). Shown only while the server flag
/// `accountSelfDelete` is on; see `AccountDeletion.swift` for the contract.
///
/// Two confirmations, as the deletion is immediate and permanent: typing the confirm word
/// (web's step) and then a final alert before the request goes out.
struct AccountDeletionView: View {
    let deps: AppDependencies
    /// The server said self-deletion is not available (404): go back to the email request.
    let onUnavailable: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @State private var confirmFinal = false
    @State private var deleting = false
    @State private var errorKey: String?
    @State private var deleted = false
    /// True only when the server says this account has an ACTIVE paid plan (`GET /api/subscription`); any failure reads as «unknown».
    @State private var hasPaidPlan = false

    private static let supportEmail = "support@tappyai.com"
    private static let removes = (1...9).map { "account.delete.removes.\($0)" }
    private static let kept = (1...2).map { "account.delete.kept.\($0)" }

    var body: some View {
        Group {
            if deleted { doneView } else { formView }
        }
        .background(TappyColor.background)
        .task { hasPaidPlan = await deps.entitlements.current() == .pro }
        .navigationTitle(Text("account.delete.title"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(Text("account.delete.finalConfirm.title"), isPresented: $confirmFinal) {
            Button(role: .destructive) { Task { await submit() } } label: { Text("account.delete.submit") }
            Button(role: .cancel) {} label: { Text("account.delete.cancel") }
        } message: {
            Text("account.delete.warning")
        }
    }

    // MARK: - Form

    private var formView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                // The web's words (R29): title, what is lost, the paid-plan paragraph (the specific one only when this
                // account is known to have an active paid plan, else the general one), and the confirm sentence.
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("account.delete.warning.title").font(TappyFont.bodyEmphasis)
                    Text("account.delete.warning")
                    Text(LocalizedStringKey(hasPaidPlan ? "account.delete.plan.known" : "account.delete.plan.generic"))
                        .accessibilityIdentifier("delete-plan-text")
                    Text("account.delete.warning.confirm").fontWeight(.semibold)
                }
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.danger)
                .padding(Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TappyColor.danger.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

                list(headingKey: "account.delete.removes.heading", leadKey: nil, keys: Self.removes)
                list(headingKey: "account.delete.kept.heading", leadKey: "account.delete.kept.lead", keys: Self.kept)

                Text(String(format: NSLocalizedString("account.delete.confirm.label", comment: ""),
                            NSLocalizedString("account.delete.confirm.word", comment: "")))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                TextField(String(localized: "account.delete.confirm.word"), text: $typed)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(TappyFont.callout)
                    .padding(Spacing.sm)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .accessibilityIdentifier("delete-word")

                if let errorKey {
                    Text(LocalizedStringKey(errorKey))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.danger)
                }

                Button {
                    confirmFinal = true
                } label: {
                    Text(deleting ? "account.delete.deleting" : "account.delete.submit")
                        .font(TappyFont.callout)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .background(TappyColor.danger)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(deleting || !AccountDeletion.isConfirmWord(typed))
                .opacity(deleting || !AccountDeletion.isConfirmWord(typed) ? 0.5 : 1)
                .accessibilityIdentifier("delete-submit")

                Button { dismiss() } label: {
                    Text("account.delete.cancel")
                        .font(TappyFont.callout)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .disabled(deleting)
            }
            .padding(Spacing.md)
        }
    }

    private func list(headingKey: String, leadKey: String?, keys: [String]) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(LocalizedStringKey(headingKey))
                .font(TappyFont.bodyEmphasis)
                .foregroundStyle(TappyColor.textPrimary)
            if let leadKey {
                Text(LocalizedStringKey(leadKey))
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
            ForEach(keys, id: \.self) { key in
                HStack(alignment: .top, spacing: Spacing.xs) {
                    Text("•")
                    Text(LocalizedStringKey(key))
                }
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    // MARK: - Done

    private var doneView: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("account.delete.done.title")
                .font(TappyFont.headline)
                .foregroundStyle(TappyColor.textPrimary)
            Text("account.delete.done.p1")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
            Text(String(format: NSLocalizedString("account.delete.done.p2", comment: ""), Self.supportEmail))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
            Button {
                Task { await deps.authRepository.signOut() }
                dismiss()
            } label: {
                Text("account.delete.done.home")
                    .font(TappyFont.callout)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm)
                    .background(TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("delete-done-home")
            Spacer()
        }
        .padding(Spacing.md)
        .interactiveDismissDisabled()
        .onDisappear {
            // The account no longer exists: never leave its session behind, however the sheet closes.
            Task { await deps.authRepository.signOut() }
        }
    }

    // MARK: - Request

    private func submit() async {
        guard !deleting, AccountDeletion.isConfirmWord(typed) else { return }
        deleting = true
        errorKey = nil
        let result: Result<Void, Error>
        do {
            try await AccountDeletionService(api: deps.api).requestSelfDeletion(confirm: typed)
            result = .success(())
        } catch {
            result = .failure(error)
        }
        deleting = false
        switch AccountDeletionOutcome.from(result) {
        case .deleted: deleted = true
        case .notAvailable: onUnavailable()
        case let other: errorKey = other.errorKey
        }
    }
}
