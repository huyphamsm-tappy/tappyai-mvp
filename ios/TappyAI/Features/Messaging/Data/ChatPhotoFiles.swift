import Foundation

/// This device's own copy of the pictures it has shown (owner 04/11/2026: "like Zalo" — the server keeps a picture for 30 days, the
/// device keeps its copy; the web does the same in the browser's Cache Storage, Android in the app's files folder). A picture is saved
/// the first time its signed link is shown, named by the MESSAGE id (never by the link, which changes every hour). When the server no
/// longer has the picture (`ChatMessageMedia.expired`) the screen asks for the copy instead.
///
/// Plain file operations over a base folder passed in, so the rules are tested without a device. Best effort and silent: a full disk, a
/// missing file or a message id that is not a plain id simply means "no copy". The folder is emptied on sign-out (`clearAll`), so the
/// next person on a shared phone inherits nothing.
enum ChatPhotoFiles {
    static let folderName = "chat_photos"
    /// Same ceiling as the upload limit plus a little: a larger answer is not one of our pictures.
    static let maxCopyBytes = 6 * 1024 * 1024

    /// The app's private Application Support folder (not the Caches folder: the system may purge that).
    static var defaultBase: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
    }

    static func directory(in base: URL) -> URL { base.appendingPathComponent(folderName, isDirectory: true) }

    private static func fileURL(base: URL, messageId: String) -> URL? {
        DeepLinkHandler.isSafeId(messageId) ? directory(in: base).appendingPathComponent(messageId + ".img") : nil
    }

    static func has(base: URL, messageId: String) -> Bool { load(base: base, messageId: messageId) != nil }

    /// The saved copy, or nil.
    static func load(base: URL, messageId: String) -> URL? {
        guard let url = fileURL(base: base, messageId: messageId),
              let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? NSNumber, size.intValue > 0 else { return nil }
        return url
    }

    /// Saves `data` as the copy for `messageId`; false (and nothing saved) for an empty or oversized body, an unsafe id or a write failure.
    @discardableResult
    static func save(base: URL, messageId: String, data: Data) -> Bool {
        guard !data.isEmpty, data.count <= maxCopyBytes, let target = fileURL(base: base, messageId: messageId) else { return false }
        do {
            let folder = directory(in: base)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: target, options: .atomic)
            // A copy of someone's conversation does not belong in a device backup.
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutable = target
            try? mutable.setResourceValues(values)
            return true
        } catch {
            return false
        }
    }

    /// Removes every saved copy (sign-out). Never throws.
    static func clearAll(base: URL) {
        try? FileManager.default.removeItem(at: directory(in: base))
    }
}
