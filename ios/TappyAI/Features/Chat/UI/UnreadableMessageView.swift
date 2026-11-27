import SwiftUI

/// One message that the phone cannot show (layout step 2, §D): «Tin nhắn này chưa hiển thị được.» with «Thử lại» (asks the answer again, when the
/// reply is the last one) and «Sao chép» (copies the text as it came). It is the only thing this message draws; the other messages are untouched.
struct UnreadableMessageView: View {
    var onRetry: (() -> Void)?
    let onCopy: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("msg.unreadable")
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textSecondary)
            HStack(spacing: Spacing.xs) {
                if let onRetry {
                    Button(action: onRetry) {
                        AnswerChip(text: NSLocalizedString("msg.unreadable.retry", comment: ""), symbol: "arrow.counterclockwise")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("unreadable-retry")
                }
                Button(action: onCopy) {
                    AnswerChip(text: NSLocalizedString("msg.unreadable.copy", comment: ""), symbol: "doc.on.doc")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("unreadable-copy")
            }
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .answerSurface()
        .accessibilityElement(children: .contain)
    }
}
