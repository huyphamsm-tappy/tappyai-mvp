import Foundation

/// Scratch space for transient files (e.g. a captured video thumbnail before upload).
/// Lives under the system temp dir; callers clean up, and the OS may purge it.
struct TemporaryStorage {
    private let root: URL

    init() {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("tappyai", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    func url(for name: String) -> URL { root.appendingPathComponent(name) }

    func write(_ data: Data, name: String) throws -> URL {
        let dest = url(for: name)
        try data.write(to: dest, options: .atomic)
        return dest
    }

    func removeAll() {
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
}
