import AVFoundation

/// Makes a smaller copy of a picked clip before it is uploaded. The clip is sent as the camera wrote it (an iPhone writes 1080p or 4K at a
/// high rate: tens to hundreds of MB), and the upload over the phone's network took minutes (owner UAT 26/11: «up clip rất lâu»). The server turns
/// every clip into a 360p and a 720p ladder, so a 720p source loses nothing the viewer can see.
///
/// Best effort, never a blocker: a small clip is sent as it is, and when the export fails, or the copy is not smaller, the original is used.
enum ClipTranscoder {
    /// A clip at or under this size is uploaded as it is: the upload is shorter than the export would be.
    static let skipBelowBytes = 20 * 1024 * 1024

    /// The rule, pure: whether a file of this size is worth exporting.
    static func shouldTranscode(fileSize: Int) -> Bool { fileSize > skipBelowBytes }

    /// A 720p H.264 MP4 copy of `source` in the temporary folder, or nil when the clip is small, the export fails, or the copy is not smaller.
    /// The copy carries no metadata (no location, device or creation time); the caller still neutralises it before the bytes leave the phone.
    static func smallerCopy(of source: URL) async -> URL? {
        guard let size = (try? FileManager.default.attributesOfItem(atPath: source.path)[.size] as? Int) ?? nil,
              shouldTranscode(fileSize: size) else { return nil }
        let asset = AVURLAsset(url: source)
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1280x720) else { return nil }
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("clip-\(UUID().uuidString).mp4")
        session.outputURL = output
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true
        session.metadata = []

        let started = Date()
        let box = ExportBox(session)
        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                box.session.exportAsynchronously { continuation.resume() }
            }
        } onCancel: {
            box.session.cancelExport()
        }

        let newSize = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? Int) ?? nil
        let seconds = Date().timeIntervalSince(started)
        guard session.status == .completed, let newSize, newSize > 0, newSize < size else {
            try? FileManager.default.removeItem(at: output)
            DiagnosticSnapshot.shared.record("clip compress skipped fromMB=\(size / 1_048_576) seconds=\(Int(seconds)) status=\(session.status.rawValue)")
            return nil
        }
        DiagnosticSnapshot.shared.record("clip compress fromMB=\(size / 1_048_576) toMB=\(newSize / 1_048_576) seconds=\(Int(seconds))")
        return output
    }

    /// The export session is used from the task and from its cancel handler; AVFoundation allows that.
    private final class ExportBox: @unchecked Sendable {
        let session: AVAssetExportSession
        init(_ session: AVAssetExportSession) { self.session = session }
    }
}
