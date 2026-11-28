import SwiftUI

/// Owner 28/11/2026 (web `AccountGate.tsx`): everything except the chat with Tappy needs an account. A visitor may LOOK at a tool, not use it:
/// the screen is shown inert under a banner with a sign-in button; a signed-in person gets the screen untouched. The server refuses a visitor
/// too (401 `login_required` / 403 `account_required`); this only says why before the person tries.
struct AccountGate: ViewModifier {
    let signedIn: Bool
    let onSignIn: () -> Void

    func body(content: Content) -> some View {
        content
            .disabled(!signedIn)
            .opacity(signedIn ? 1 : 0.6)
            .safeAreaInset(edge: .top, spacing: 0) {
                if !signedIn {
                    HStack(spacing: 10) {
                        Image(systemName: "lock.fill").font(.system(size: 14)).foregroundStyle(Color.orange)
                        Text("smartTools.gate.banner")
                            .font(.system(size: 13)).foregroundStyle(TappyColor.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Button(action: onSignIn) {
                            Text("auth.signIn").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                                .padding(.horizontal, 14).padding(.vertical, 7)
                                .background(TappyColor.primary, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("account-gate-signin")
                    }
                    .padding(12)
                    .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.orange.opacity(0.4), lineWidth: 1))
                    .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 4)
                    .background(TappyColor.background)
                    .accessibilityIdentifier("account-gate-banner")
                }
            }
    }
}

extension View {
    /// Shows this screen inert under the sign-in banner while nobody is signed in.
    func accountGated(signedIn: Bool, onSignIn: @escaping () -> Void) -> some View {
        modifier(AccountGate(signedIn: signedIn, onSignIn: onSignIn))
    }
}
