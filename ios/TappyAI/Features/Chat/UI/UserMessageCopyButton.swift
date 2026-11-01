import SwiftUI

/// The copy button under a question the person sent (web `UserMessageCopy.tsx`, Android `UserMessageCopyButton`): copies the text
/// exactly as typed, says "Đã sao chép" (a check mark and the accessibility label) for about 2 seconds, then goes back.
struct UserMessageCopyButton: View {
    let text: String
    @State private var copied = false

    private var label: String {
        copied ? NSLocalizedString("chat.userMessage.copied", comment: "") : NSLocalizedString("chat.userMessage.copy", comment: "")
    }

    var body: some View {
        if let value = userCopyText(text) {
            Button {
                UIPasteboard.general.string = value
                copied = true
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(2))
                    copied = false
                }
            } label: {
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 12))
                    .foregroundStyle(copied ? TappyColor.success : TappyColor.textSecondary)
                    .frame(minWidth: 28, minHeight: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityIdentifier("chat-user-copy")
        }
    }
}
