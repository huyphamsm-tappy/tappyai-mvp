import Foundation
import UIKit
import UniformTypeIdentifiers

/// Gets a picked photo or PDF ready for the chat request, off the main thread (a camera photo is several megabytes; a PDF is read whole).
enum AttachmentPreparer {
    /// A photo is drawn no bigger than this on its longer side before it goes: a phone photo is 4000+ px, and the model needs far less.
    static let maxPhotoSide: CGFloat = 1600
    /// The server refuses a picture whose data URL is longer than this (clientInput.ts `maxImageDataUrlChars`).
    static let maxImageDataURLChars = 8_000_000
    private static let jpegQualities: [CGFloat] = [0.8, 0.6, 0.4]

    /// The length of `data:<mime>;base64,<bytes>` for `byteCount` bytes. Pure.
    static func dataURLLength(byteCount: Int, mime: String) -> Int {
        "data:\(mime);base64,".count + 4 * ((byteCount + 2) / 3)
    }

    /// The size a picture is drawn at so its longer side is at most `maxSide` (never enlarged). Pure.
    static func fittedSize(width: CGFloat, height: CGFloat, maxSide: CGFloat) -> CGSize {
        let longest = max(width, height)
        guard longest > maxSide, longest > 0 else { return CGSize(width: width, height: height) }
        let scale = maxSide / longest
        return CGSize(width: max(1, (width * scale).rounded()), height: max(1, (height * scale).rounded()))
    }

    /// A photo as a JPEG the server takes: orientation applied, shrunk to `maxPhotoSide`, compressed until its data URL fits the server's
    /// bound. Nil when the bytes are not a picture, or none of the qualities fits. (HEIC and PNG become JPEG; a GIF becomes its first frame.)
    static func jpegForSending(_ raw: Data) -> Data? {
        guard let image = UIImage(data: raw), image.size.width > 0, image.size.height > 0 else { return nil }
        let target = fittedSize(width: image.size.width, height: image.size.height, maxSide: maxPhotoSide)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let drawn = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        for quality in jpegQualities {
            guard let data = drawn.jpegData(compressionQuality: quality) else { return nil }
            if dataURLLength(byteCount: data.count, mime: "image/jpeg") <= maxImageDataURLChars { return data }
        }
        return nil
    }

    /// `jpegForSending` off the main thread.
    static func prepareJPEG(_ raw: Data) async -> Data? {
        await Task.detached(priority: .userInitiated) { () -> Data? in
            AttachmentPreparer.jpegForSending(raw)
        }.value
    }

    /// A PDF the person chose in the Files picker.
    struct PickedFile: Sendable {
        let name: String
        let mime: String?
        let byteCount: Int
        /// Nil when the file was too large to be worth reading (the check refuses it by its size alone).
        let data: Data?
    }

    /// Reads a file the document picker returned. A URL from `fileImporter` is security-scoped: access is started before the read and
    /// stopped after, whatever happens. The size is asked first, so a file over the limit is refused without reading it. Nil when it cannot be read.
    static func readPickedFile(at url: URL) async -> PickedFile? {
        await Task.detached(priority: .userInitiated) { () -> PickedFile? in
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize
            if let size, size > ChatAttachmentLimits.pdfBytes {
                return PickedFile(name: url.lastPathComponent, mime: mime, byteCount: size, data: nil)
            }
            guard let data = try? Data(contentsOf: url) else { return nil }
            return PickedFile(name: url.lastPathComponent, mime: mime, byteCount: data.count, data: data)
        }.value
    }
}
