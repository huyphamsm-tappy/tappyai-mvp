import Foundation

// Explore video (server-owned pipeline): wire shapes and the PURE rules of the app side.
// Contract: docs/handoff/EXPLORE-VIDEO-API-CONTRACT-20261105.md. Every route answers 404 while the server flag is off;
// the app reads that as «feature not there» and keeps the legacy clip upload path unchanged.

// MARK: - Lifecycle state

/// The server's video state. An unknown (newer) value is read as «still processing», never as ready.
enum ExploreVideoState: String, Sendable, Equatable {
    case draft, uploading, uploaded, processing, moderating
    case ready
    case reviewRequired = "review_required"
    case rejected, published, failed, deleted
    case unknown

    init(raw: String?) {
        guard let raw, let value = ExploreVideoState(rawValue: raw) else { self = .unknown; return }
        self = value
    }
}

/// What the person sees. Several server states fold into one phase (contract §1).
enum ExploreVideoPhase: Equatable, Sendable {
    case processing, awaitingReview, ready, published, rejected, failed

    static func phase(for state: ExploreVideoState) -> ExploreVideoPhase {
        switch state {
        case .draft, .uploading, .uploaded, .processing, .moderating, .unknown: return .processing
        case .reviewRequired: return .awaitingReview
        case .ready: return .ready
        case .published: return .published
        case .rejected: return .rejected
        case .failed, .deleted: return .failed
        }
    }

    /// Polling stops here. `awaitingReview` keeps polling (a person may approve it while the composer is open).
    var isTerminal: Bool {
        switch self {
        case .ready, .published, .rejected, .failed: return true
        case .processing, .awaitingReview: return false
        }
    }

    /// Only a clip the server marked ready can be posted.
    var canPublish: Bool { self == .ready }

    /// The localized label key shown while the composer waits.
    var labelKey: String {
        switch self {
        case .processing: return "video.status.processing"
        case .awaitingReview: return "video.status.awaitingReview"
        case .ready: return "video.status.ready"
        case .published: return "video.status.published"
        case .rejected: return "video.status.rejected"
        case .failed: return "video.status.failed"
        }
    }
}

// MARK: - Wire shapes

struct VideoUploadSession: Decodable, Sendable, Equatable {
    let assetId: String
    let state: String?
    let uploadUrl: String?
    let contentType: String?
    let reused: Bool?
}

struct VideoStatusResponse: Decodable, Sendable, Equatable {
    let assetId: String?
    let state: String?

    var parsedState: ExploreVideoState { ExploreVideoState(raw: state) }
}

struct PlaybackCookie: Decodable, Sendable, Equatable {
    let name: String
    let value: String
    let domain: String
    let path: String
    let expiresAt: String?
}

/// The overlay document of a post inside the playback answer. STRICT: one layer that does not decode makes the whole
/// document nil (nothing is drawn), never a partial overlay. The video plays either way.
struct StrictOverlayDocument: Decodable, Sendable, Equatable {
    let value: OverlayDocument

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: OverlayDocument.CodingKeys.self)
        let version = try c.decode(Int.self, forKey: .schemaVersion)
        let layers = try c.decode([OverlayLayer].self, forKey: .layers)
        value = OverlayDocument(schemaVersion: version, layers: layers)
    }
}

struct PlaybackOverlay: Decodable, Sendable, Equatable {
    let version: Int
    let doc: OverlayDocument?

    enum CodingKeys: String, CodingKey { case version, doc }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = (try? c.decode(Int.self, forKey: .version)) ?? 0
        doc = (try? c.decode(StrictOverlayDocument.self, forKey: .doc))?.value
    }
}

struct VideoPlaybackGrant: Decodable, Sendable, Equatable {
    let assetId: String?
    let manifestUrl: String
    let expiresAt: String?
    let ttlSeconds: Int?
    let cookie: PlaybackCookie?
    let overlay: PlaybackOverlay?

    enum CodingKeys: String, CodingKey { case assetId, manifestUrl, expiresAt, ttlSeconds, cookie, overlay }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        assetId = try? c.decodeIfPresent(String.self, forKey: .assetId)
        manifestUrl = try c.decode(String.self, forKey: .manifestUrl)
        expiresAt = try? c.decodeIfPresent(String.self, forKey: .expiresAt)
        ttlSeconds = try? c.decodeIfPresent(Int.self, forKey: .ttlSeconds)
        cookie = try? c.decodeIfPresent(PlaybackCookie.self, forKey: .cookie)
        // A broken overlay must never break playback.
        overlay = (try? c.decodeIfPresent(PlaybackOverlay.self, forKey: .overlay)) ?? nil
    }

    init(assetId: String?, manifestUrl: String, expiresAt: String?, ttlSeconds: Int?, cookie: PlaybackCookie?, overlay: PlaybackOverlay? = nil) {
        self.assetId = assetId
        self.manifestUrl = manifestUrl
        self.expiresAt = expiresAt
        self.ttlSeconds = ttlSeconds
        self.cookie = cookie
        self.overlay = overlay
    }
}

struct VideoDownloadStatusResponse: Decodable, Sendable, Equatable {
    let status: String?
    let code: String?

    var parsed: ExploreDownloadStatus { ExploreDownloadStatus(raw: status) }
}

/// `GET/POST .../download` status. Unknown reads as «none».
enum ExploreDownloadStatus: String, Sendable, Equatable {
    case none, rendering, ready, failed

    init(raw: String?) {
        guard let raw, let value = ExploreDownloadStatus(rawValue: raw) else { self = .none; return }
        self = value
    }
}

// MARK: - Upload helpers

enum ExploreVideoUploadRules {
    /// The content types the new route accepts (contract §2). Anything else keeps the legacy path.
    static func contentType(forExtension ext: String) -> String? {
        switch ext.lowercased() {
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        default: return nil
        }
    }

    /// 8..128 characters of `A-Za-z0-9_-`. A NEW key for every attempt.
    static func makeIdempotencyKey() -> String {
        "ios-" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    static func isValidIdempotencyKey(_ key: String) -> Bool {
        let count = key.utf8.count
        guard count >= 8 && count <= 128 else { return false }
        return key.utf8.allSatisfy { b in
            (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || b == 0x5F || b == 0x2D
        }
    }

    /// Seconds to wait before poll number `attempt` (0-based): 2 s growing to 5 s.
    static func pollDelay(attempt: Int) -> TimeInterval {
        min(5.0, 2.0 + Double(max(0, attempt)) * 0.5)
    }

    /// About 15 minutes of polling, then the screen says it is still working (the clip is not lost).
    static let maxPollAttempts = 200
}

// MARK: - Errors

/// Every documented refusal, as one value the screens can switch on. Pure mapping from `AppError`.
enum ExploreVideoIssue: Equatable, Sendable {
    case featureOff            // 404 on the first call: the server flag is off
    case notFound
    case consentDeclined       // the AI-consent gate of the rest of the app (blockedError)
    case videoConsentRequired  // 403 video_consent_required: the clip conditions were not accepted yet
    case videoConsentDeclined  // the person answered «Để sau» to the clip conditions
    case aiGate                // 403 ai_consent_required: another gate; NEVER reopens the sheet, only reports
    case ageRequired
    case tooLarge
    case unsupportedFormat
    case rateLimited
    case serviceUnavailable
    case storageUnavailable
    case promoting
    case incomplete            // 422 upload_incomplete
    case unreadable
    case tooLong
    case identifyingMetadata
    case assetFailed
    case notReady
    case inUse
    case overlayInvalid
    case unsupportedGlyph
    case versionConflict
    case offline
    case cancelled
    case unknown

    var messageKey: String {
        switch self {
        case .featureOff, .notFound: return "video.error.notFound"
        case .consentDeclined: return "video.error.consent"
        case .videoConsentRequired, .videoConsentDeclined: return "video.error.videoConsent"
        case .aiGate: return "video.error.aiGate"
        case .ageRequired: return "video.error.age"
        case .tooLarge: return "video.error.tooLarge"
        case .unsupportedFormat: return "video.error.format"
        case .rateLimited: return "video.error.rateLimited"
        case .serviceUnavailable: return "video.error.unavailable"
        case .storageUnavailable: return "video.error.storage"
        case .promoting: return "video.error.promoting"
        case .incomplete: return "video.error.incomplete"
        case .unreadable: return "video.error.unreadable"
        case .tooLong: return "video.error.tooLong"
        case .identifyingMetadata: return "video.error.metadata"
        case .assetFailed: return "video.error.assetFailed"
        case .notReady: return "video.error.notReady"
        case .inUse: return "video.error.inUse"
        case .overlayInvalid: return "video.error.overlayInvalid"
        case .unsupportedGlyph: return "video.error.glyph"
        case .versionConflict: return "video.error.conflict"
        case .offline: return "video.error.offline"
        case .cancelled: return "video.error.cancelled"
        case .unknown: return "video.error.generic"
        }
    }

    /// A refusal that trying again with the same input can fix.
    var isRetryable: Bool {
        switch self {
        case .incomplete, .storageUnavailable, .serviceUnavailable, .rateLimited, .offline, .promoting: return true
        default: return false
        }
    }

    static func from(_ error: Error) -> ExploreVideoIssue {
        if error is CancellationError { return .cancelled }
        if let urlError = error as? URLError {
            return urlError.code == .cancelled ? .cancelled : .offline
        }
        guard let app = error as? AppError else { return .unknown }
        if app == AIConsentStore.blockedError { return .consentDeclined }
        switch app {
        case .cancellation: return .cancelled
        case .offline: return .offline
        case .authentication(let reason):
            switch reason {
            case .aiConsentRequired: return .aiGate
            case .ageGate: return .ageRequired
            case .rateLimited, .planLimitReached, .proDailyLimitReached: return .rateLimited
            default: return .unknown
            }
        case .validation(let message):
            if message.contains("invalid_overlay") { return .overlayInvalid }
            if message.contains("video_consent_declined") { return .videoConsentDeclined }
            return .unknown
        case .network(let status, let code):
            return map(status: status, code: code)
        default:
            return .unknown
        }
    }

    /// The message for a refused `POST /api/reviews` that carried a `videoAssetId` (404 video_not_found, 409 video_not_ready /
    /// video_in_use, 503 video_promoting / video_unavailable). nil = not one of those: the caller keeps its generic handling.
    static func publishMessageKey(for error: AppError) -> String? {
        guard case .network(let status, let code) = error, let status else { return nil }
        switch (status, code) {
        case (404, "video_not_found"): return "video.error.notFound"
        case (409, "video_not_ready"): return "video.error.notReady"
        case (409, "video_in_use"): return "video.error.inUse"
        case (503, "video_promoting"): return "video.error.promoting"
        case (503, "video_unavailable"): return "video.error.unavailable"
        default: return nil
        }
    }

    static func map(status: Int?, code: String?) -> ExploreVideoIssue {
        guard let status else { return .offline }
        switch status {
        case 403: return code == "video_consent_required" ? .videoConsentRequired : .unknown
        case 404: return .notFound
        case 413: return .tooLarge
        case 415: return .unsupportedFormat
        case 429: return .rateLimited
        case 502: return .storageUnavailable
        case 503: return code == "video_promoting" ? .promoting : .serviceUnavailable
        case 409:
            switch code {
            case "asset_failed", "asset_deleted": return .assetFailed
            case "video_not_ready", "not_ready": return .notReady
            case "video_in_use": return .inUse
            case "version_conflict": return .versionConflict
            default: return .unknown
            }
        case 422:
            switch code {
            case "upload_incomplete": return .incomplete
            case "unreadable_video": return .unreadable
            case "video_too_long": return .tooLong
            case "identifying_metadata": return .identifyingMetadata
            case "unsupported_format": return .unsupportedFormat
            case "overlay_invalid": return .overlayInvalid
            case "unsupported_glyph": return .unsupportedGlyph
            default: return .unknown
            }
        default:
            return .unknown
        }
    }
}
