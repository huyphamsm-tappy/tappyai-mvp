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

/// A photo or PDF on a question, with its bytes (held in memory for the session: a retry sends the question again).
struct ChatAttachment: Equatable, Sendable, Identifiable {
    let id: String
    let kind: ChatAttachmentKind
    /// The file's name as the person knows it (the PDF's name is what the bubble and the server show).
    let name: String
    /// The type the data URL declares: `application/pdf` or one of the four picture types.
    let mime: String
    let data: Data

    init(id: String = UUID().uuidString, kind: ChatAttachmentKind, name: String, mime: String, data: Data) {
        self.id = id
        self.kind = kind
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        // The server's own fallback for a nameless PDF (clientInput.ts); a nameless picture is just a photo.
        self.name = trimmed.isEmpty ? (kind == .pdf ? "tai-lieu.pdf" : "photo.jpg") : trimmed
        self.mime = mime
        self.data = data
    }

    var byteCount: Int { data.count }

    /// `data:<type>;base64,...` - the type must be the one the attachment declares (the server rejects a mismatch).
    var dataURL: String { "data:\(mime);base64,\(data.base64EncodedString())" }

    /// One entry of the request's `experimental_attachments` (the AI SDK's shape: `url`, `contentType`, `name`).
    var wireObject: [String: String] { ["url": dataURL, "contentType": mime, "name": name] }

    /// Compared without the bytes: a message list diffed on every streamed character must not compare megabytes.
    static func == (lhs: ChatAttachment, rhs: ChatAttachment) -> Bool {
        lhs.id == rhs.id && lhs.kind == rhs.kind && lhs.name == rhs.name && lhs.mime == rhs.mime && lhs.data.count == rhs.data.count
    }
}

extension MessagePayload {
    /// The words that stand for an attachment where only text can go (an earlier question in the history, a saved conversation).
    static func attachmentNote(_ attachment: ChatAttachment) -> String {
        attachment.kind == .pdf ? "[Attached with this message: \(attachment.name)]" : "[Attached with this message: photo]"
    }

    /// What a saved conversation holds: the text alone. A question that was only a file is saved as the note naming it, so it is not an empty message.
    static func saved(from messages: [ChatMessage]) -> [MessagePayload] {
        messages.map { message in
            guard let attachment = message.attachment,
                  message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return MessagePayload(role: message.role.rawValue, content: message.content)
            }
            return MessagePayload(role: message.role.rawValue, content: attachmentNote(attachment))
        }
    }

    /// The history one request sends. The latest question carries its photo or PDF; an earlier one is NOT sent again (it would resend
    /// megabytes every turn): its text names the file instead, as Android's history compaction and the web's note do.
    static func history(from messages: [ChatMessage]) -> [MessagePayload] {
        let lastUser = messages.lastIndex(where: { $0.isUser })
        return messages.enumerated().map { index, message in
            guard let attachment = message.attachment else {
                return MessagePayload(role: message.role.rawValue, content: message.content)
            }
            if index == lastUser {
                return MessagePayload(role: message.role.rawValue, content: message.content, attachments: [attachment])
            }
            let note = attachmentNote(attachment)
            let text = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? note : "\(message.content)\n\(note)"
            return MessagePayload(role: message.role.rawValue, content: text)
        }
    }
}
