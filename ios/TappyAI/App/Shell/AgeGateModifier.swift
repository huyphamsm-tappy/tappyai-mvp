import SwiftUI

/// The app-wide 18+ gate (handover §5, web `requireEligibleUser`). A signed-in account whose date of birth is missing (`unknown`), under 18
/// (`ineligible`) or cannot be read is held on the age screen until it declares a date. Every product API refuses such an account anyway; this
/// screen only tells the person why, instead of letting each feature fail on its own. Guests are handled by the chat's own guest flow.
struct AgeGateModifier: ViewModifier {
    let deps: AppDependencies
    let signedIn: Bool

    @State private var showing = false
    @State private var blocked = false
    @State private var submitting = false
    @State private var formError: String?

    func body(content: Content) -> some View {
        content
            .task(id: signedIn) { await check() }
            .fullScreenCover(isPresented: $showing) {
                AgeCheckView(
                    isGuest: false,
                    blocked: blocked,
                    submitting: submitting,
                    formError: formError,
                    onSubmit: { day, month, year in Task { await submit(day, month, year) } },
                    onEdit: { blocked = false; formError = nil },
                    onClose: { Task { await deps.authRepository.signOut() } }
                )
            }
    }

    /// Reads the account's age status when a person signs in (or the app opens signed in).
    private func check() async {
        guard signedIn else {
            showing = false
            return
        }
        do {
            let status = try await ProfileService(api: deps.api).fetchAgeStatus()
            apply(status)
        } catch {
            // A read that fails holds the account like an unknown age: the person declares again, and the server still decides.
            blocked = false
            formError = NSLocalizedString("chat.age.error.failed", comment: "")
            showing = true
        }
    }

    private func submit(_ day: String, _ month: String, _ year: String) async {
        guard !submitting else { return }
        guard let iso = DateOfBirthInput.iso(day: day, month: month, year: year) else {
            formError = NSLocalizedString("chat.age.error.invalid", comment: "")
            return
        }
        submitting = true
        defer { submitting = false }
        do {
            let result = try await ProfileService(api: deps.api).updateDateOfBirth(iso)
            formError = nil
            apply(result)
        } catch {
            formError = NSLocalizedString("chat.age.error.failed", comment: "")
        }
    }

    private func apply(_ response: DateOfBirthUpdateResponse) {
        if response.status == .eligible {
            showing = false
            blocked = false
            formError = nil
            return
        }
        blocked = response.status == .ineligible
        showing = true
    }
}
