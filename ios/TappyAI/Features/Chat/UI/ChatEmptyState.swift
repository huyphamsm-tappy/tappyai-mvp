import SwiftUI

/// Empty chat state — the web's (`HomeGreeting`, owner 20/11): the mascot and ONE greeting line for the time the person has
/// (`ChatGreeting`, «Huy ơi, chào buổi sáng! …»), in the web's gold (`#ffc83d`). No mood buttons, no suggested questions, no
/// memory chip (owner UAT 25/11: «vào khung chat không có câu chào mở đầu như web»).
struct ChatEmptyState: View {
    /// The line, already chosen for this moment and name.
    let greeting: String
    let locale: String
    /// Kept so the call site does not change; the chip it drew is gone.
    let hasMemory: Bool
    /// Kept so the call site does not change; nothing here sends a prompt any more.
    let onQuickPrompt: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                Spacer(minLength: Spacing.xxl)
                TappyAvatar(size: 112)
                Text(verbatim: greeting)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(ChatTheme.greeting)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Spacing.md)
                    .accessibilityIdentifier("home-greeting-line")
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, Spacing.lg)
        }
        // A tap on the empty space, or a drag, closes the keyboard (owner UAT: it could not be dismissed).
        .scrollDismissesKeyboard(.interactively)
        .onTapGesture { UIApplication.shared.dismissKeyboard() }
    }
}
