import Foundation

// A photo or a PDF the person adds to a question, as the web does (`composerAttachment.ts`, `ChatInterface.tsx`; the server reads it in
// `clientInput.ts` validateAttachment). Android does the same (`chat/Attachments.kt`).

/// What a file the composer accepts is.
enum ChatAttachmentKind: String, Equatable, Sendable {
    case image, pdf
}

/// The verdict on a picked file: accepted as a picture or a PDF, or why it is refused.
enum AttachmentCheck: Equatable, Sendable {
    case ok(ChatAttachmentKind)
    case unsupported
    case pdfTooLarge

    /// The catalog key of the sentence to show when the file is refused (the web's `attach.unsupported` / `attach.pdfTooLarge`); nil when accepted.
    var errorKey: String? {
        switch self {
        case .ok: return nil
        case .unsupported: return "chat.attach.unsupported"
        case .pdfTooLarge: return "chat.attach.pdfTooLarge"
        }
    }
}

enum ChatAttachmentLimits {
    /// The largest PDF the server reads (web `PDF_MAX_BYTES`).
    static let pdfBytes = 3_000_000
    static let pdfMime = "application/pdf"
    /// The picture types the server accepts (clientInput.ts `IMAGE_ATTACHMENT_TYPES`).
    static let imageMimes: Set<String> = ["image/png", "image/jpeg", "image/webp", "image/gif"]
}

/// Whether a file may be sent: a PNG / JPEG / WEBP / GIF picture, or a PDF up to 3 000 000 bytes; nothing else. Pure.
/// The web applies no size limit to a picture here (the server bounds it, and the app shrinks a photo before it goes), only to a PDF.
func attachmentCheck(mime: String?, byteCount: Int) -> AttachmentCheck {
    let type = (mime ?? "").lowercased()
    if ChatAttachmentLimits.imageMimes.contains(type) { return .ok(.image) }
    if type == ChatAttachmentLimits.pdfMime {
        return byteCount > ChatAttachmentLimits.pdfBytes ? .pdfTooLarge : .ok(.pdf)
    }
    return .unsupported
}
