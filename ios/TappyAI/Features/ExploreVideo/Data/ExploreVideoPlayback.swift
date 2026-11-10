import Foundation
import AVFoundation

/// What the native player needs to start one Explore clip (contract §5). Pure value, built from the server's grant.
struct PreparedPlayback: Equatable {
    let manifestURL: URL
    let cookies: [HTTPCookie]
    /// Seconds from now until the grant should be renewed (80% of the TTL).
    let refreshAfter: TimeInterval
    /// The post's text overlay, only when it passed the schema validator and has a layer. nil = draw nothing.
    let overlay: OverlayDocument?
}

enum ExploreVideoPlayback {
    /// The server's cookie lifetime is 600 s; the player renews at 80% of it (≈480 s). Never sooner than 10 s.
    static let defaultTTL: TimeInterval = 600
    static let refreshFraction: Double = 0.8
    static let minimumRefresh: TimeInterval = 10
    /// After a failed renewal the player tries again in this many seconds.
    static let retryAfterFailure: TimeInterval = 30

    static func refreshDelay(ttlSeconds: Int?) -> TimeInterval {
        let ttl = (ttlSeconds ?? 0) > 0 ? TimeInterval(ttlSeconds ?? 0) : defaultTTL
        return max(minimumRefresh, ttl * refreshFraction)
    }

    /// An asset id is a path piece of the manifest URL. Only `[A-Za-z0-9_-]{8,64}` is ever put back into a request path.
    static func isSafeAssetId(_ s: String) -> Bool {
        let n = s.utf8.count
        guard n >= 8 && n <= 64 else { return false }
        return s.utf8.allSatisfy { b in
            (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || b == 0x5F || b == 0x2D
        }
    }

    private static func isUUID(_ s: String) -> Bool { UUID(uuidString: s) != nil }

    /// The asset id inside an HLS manifest URL (`.m3u8`), or nil for anything else (an old MP4, a YouTube link).
    /// A UUID path piece wins; otherwise the folder that holds the manifest.
    static func assetId(fromManifestURL url: URL) -> String? {
        guard url.pathExtension.lowercased() == "m3u8" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        if let uuid = parts.first(where: { isUUID($0) }) { return uuid }
        guard parts.count >= 2 else { return nil }
        let parent = parts[parts.count - 2]
        return isSafeAssetId(parent) ? parent : nil
    }

    /// The signed-access cookie the CDN wants on EVERY manifest, playlist and segment request.
    static func cookie(from c: PlaybackCookie) -> HTTPCookie? {
        guard !c.name.isEmpty, !c.value.isEmpty, !c.domain.isEmpty else { return nil }
        var props: [HTTPCookiePropertyKey: Any] = [
            .name: c.name,
            .value: c.value,
            .domain: c.domain,
            .path: c.path.isEmpty ? "/" : c.path,
            .secure: "TRUE",
        ]
        if let raw = c.expiresAt, let date = ISO8601Timestamp.date(from: raw) {
            props[.expires] = date
        }
        return HTTPCookie(properties: props)
    }

    static func assetOptions(cookies: [HTTPCookie]) -> [String: Any]? {
        cookies.isEmpty ? nil : [AVURLAssetHTTPCookiesKey: cookies]
    }

    /// nil when the grant cannot be played (no usable manifest URL, or a cookie the CDN would refuse).
    static func prepare(_ grant: VideoPlaybackGrant) -> PreparedPlayback? {
        guard let url = URL(string: grant.manifestUrl), url.scheme?.lowercased() == "https" else { return nil }
        var cookies: [HTTPCookie] = []
        if let raw = grant.cookie {
            guard let cookie = cookie(from: raw) else { return nil }
            cookies.append(cookie)
        }
        return PreparedPlayback(manifestURL: url, cookies: cookies, refreshAfter: refreshDelay(ttlSeconds: grant.ttlSeconds),
                                overlay: drawableOverlay(grant.overlay))
    }

    /// The overlay is drawn only when its document is valid (contract §5) and not empty. Invalid = the video plays without text.
    static func drawableOverlay(_ overlay: PlaybackOverlay?) -> OverlayDocument? {
        guard let doc = overlay?.doc, !doc.layers.isEmpty, OverlayValidator.isValid(doc) else { return nil }
        return doc
    }

    static func makeAsset(_ prepared: PreparedPlayback) -> AVURLAsset {
        AVURLAsset(url: prepared.manifestURL, options: assetOptions(cookies: prepared.cookies))
    }
}
