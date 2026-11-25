import SwiftUI

/// Empty chat state — the web's (`HomeGreeting`, owner 20/11): the mascot and ONE greeting line. No mood buttons, no
/// suggested questions, no memory chip (owner UAT 25/11 asked for the same on iOS: «bỏ câu hỏi gợi ý trong khung chat»).
/// The one welcome line comes from the String Catalog in the app's language (`ChatWelcome`).
struct ChatEmptyState: View {
    let locale: String
    /// Kept so the call site does not change; the chip it drew is gone.
    let hasMemory: Bool
    /// Kept so the call site does not change; nothing here sends a prompt any more.
    let onQuickPrompt: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.sm) {
                Spacer(minLength: Spacing.xxl)
                TappyAvatar(size: 96)
                Text(ChatWelcome.title)
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.textPrimary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Spacing.md)
            .padding(.bottom, Spacing.lg)
        }
    }
}
