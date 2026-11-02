import Foundation

/// What is copied from a question the person sent: the text EXACTLY as typed (an answer is copied as plain text; a question is never
/// edited, trimmed or rewritten). Nil for a blank one (nothing to copy, so no button). Port of Android `userCopyText` and web
/// `UserMessageCopy.tsx`.
func userCopyText(_ text: String) -> String? {
    text.allSatisfy { $0.isWhitespace || $0.isNewline } ? nil : text
}
