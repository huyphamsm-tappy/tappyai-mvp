import Foundation

/// The clip's own video as a local FILE, for TikTok (which takes files, never links — owner
/// requirement UAT 28/09) and any app in the system share sheet. Port of Android `ReviewShare.kt`:
///
///  - only a clip UPLOADED to TappyAI (`source_type == "upload"`, an https `media_url`) — a linked
///    YouTube/TikTok video is not ours to redistribute and shares as the card + link;
///  - at most `maxBytes` (150 MB, the upload ceiling); larger, non-2xx or unreachable → nil and the
///    caller falls back to the card image;
///  - the download lands in a temporary file that is moved into place only when complete, so a
///    cancelled fetch never leaves a half video to be shared.
enum ClipVideoFile {
    static let maxBytes: Int64 = 150 * 1024 * 1024

    /// The shareable video URL of a review, or nil when it is not an uploaded clip.
    static func sourceURL(of review: Review) -> URL? {
        guard review.contentType == "video", review.sourceType == "upload",
              let raw = review.mediaUrl, raw.lowercased().hasPrefix("https://"),
              let url = URL(string: raw) else { return nil }
        return url
    }

    static func download(_ url: URL, reviewId: String) async -> URL? {
        var request = URLRequest(url: url)
        request.timeoutInterval = 60
        guard let (temp, response) = try? await URLSession.shared.download(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
        let size = (try? FileManager.default.attributesOfItem(atPath: temp.path)[.size] as? NSNumber)?.int64Value ?? 0
        guard size > 0, size <= maxBytes else {
            try? FileManager.default.removeItem(at: temp)
            return nil
        }
        let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("share-clips", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let dest = dir.appendingPathComponent("tappyai-clip-\(reviewId).\(ext)")
        try? FileManager.default.removeItem(at: dest)
        do {
            try FileManager.default.moveItem(at: temp, to: dest)
            return dest
        } catch {
            return nil
        }
    }
}
