import Foundation

// MARK: - Media mode (matches Web tabs: Photo / Video / Link)

enum MediaMode: String, CaseIterable, Sendable {
    case photo, video, url
}

// MARK: - Upload pipeline steps

enum UploadStep: Sendable, Equatable {
    case idle
    case thumbnail
    case uploading(progress: Double)
    case processing
    case done(mediaURL: String, thumbnailURL: String)
    case failed(String)

    var isActive: Bool {
        switch self {
        case .thumbnail, .uploading, .processing: return true
        default: return false
        }
    }

    var isDone: Bool {
        if case .done = self { return true }
        return false
    }
}

// MARK: - URL source detection

enum ExternalSource: String, CaseIterable, Sendable {
    case youtube, tiktok, facebook

    var displayLabel: String {
        switch self {
        case .youtube: return "YouTube"
        case .tiktok: return "TikTok"
        case .facebook: return "Facebook"
        }
    }

    var icon: String {
        switch self {
        case .youtube: return "play.rectangle.fill"
        case .tiktok: return "music.note"
        case .facebook: return "book.fill"
        }
    }

    /// Detects the provider of a pasted URL, or nil when this client cannot parse it.
    ///
    /// Mirrors the web's `detectSource` (src/lib/links/platforms.ts): a matcher per provider, and
    /// nothing else. Which of these the composer may actually OFFER is not decided here — the
    /// backend owns that via `/api/config` `video.linkProviders`, applied in
    /// `CreateReviewViewModel.supportedSources`. Being parseable is not permission.
    ///
    /// The `tiktok`/`facebook` cases stay on the enum so legacy rows (created before the
    /// 2026-07-26 decision, still permitted by the DB CHECK) decode and render; they have no
    /// matcher, so they can never be attached to a NEW post.
    static func detect(url: String) -> ExternalSource? {
        let lower = url.lowercased()
        if lower.contains("youtube.com") || lower.contains("youtu.be") { return .youtube }
        return nil
    }

    static func extractYouTubeId(_ url: String) -> String? {
        let pattern = #"(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(url.startIndex..., in: url)
        guard let match = regex.firstMatch(in: url, range: range),
              match.numberOfRanges > 1,
              let idRange = Range(match.range(at: 1), in: url) else { return nil }
        let id = String(url[idRange])
        return id.isEmpty ? nil : id
    }
}

// MARK: - Music types (for the picker)

struct MusicTrack: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let title: String
    let artist: String?
    let durationSec: Int
    let audioUrl: String
    let previewUrl: String?
    let coverUrl: String?
    let categoryId: String?
    let providerId: String

    var previewSource: String { previewUrl ?? audioUrl }
}

struct MusicCategory: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let slug: String
    let labelI18n: [String: String]
    let sortOrder: Int

    var label: String { labelI18n["vi"] ?? slug }
}

struct MusicSelection: Codable, Sendable, Hashable {
    let trackId: String
    let startSec: Int
    let volume: Double
}

// MARK: - API response types

struct PhotoUploadResponse: Decodable, Sendable {
    let url: String
}

/// A server-issued permission to upload exactly one object.
///
/// `key` is chosen by the server, never by the client, and `url` is the durable
/// address to persist once the upload has been confirmed.
struct MediaUploadSessionResponse: Decodable, Sendable {
    let provider: String?
    let uploadUrl: String?
    let url: String?
    let key: String?
    let contentType: String?
}

/// The server's verdict after it looked the object up itself.
///
/// This exists because a client cannot reliably observe the result of its own
/// upload — on web the storage response is CORS-blocked entirely — so the
/// server confirms the object before any URL is used.
struct MediaUploadCompleteResponse: Decodable, Sendable {
    let ok: Bool?
    let url: String?
}

struct OEmbedResponse: Decodable, Sendable {
    let thumbnailUrl: String?
    let title: String?
    let authorName: String?

    enum CodingKeys: String, CodingKey {
        case thumbnailUrl = "thumbnail_url"
        case title
        case authorName = "author_name"
    }
}

struct AIProcessResponse: Decodable, Sendable {
    let caption: String?
    let hashtags: [String]?
    let category: String?
}

/// The publication lifecycle state of a post, as the backend reports it.
///
/// 🔑 `unknown` is a real case, not defensive padding. Full server-side video examination is
/// explicitly a future capability, so the backend may add a state this build has never heard of —
/// and an older client meeting a new value must read it as "not published". `isPublished` is the
/// single place that question is answered, and it answers it fail-closed.
enum ReviewPublicationState: String, Codable, Sendable {
    case published = "PUBLISHED"
    case underReview = "UNDER_REVIEW"
    case restricted = "RESTRICTED"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ReviewPublicationState(rawValue: raw) ?? .unknown
    }

    /// Only an explicit `PUBLISHED` counts as public.
    var isPublished: Bool { self == .published }
}

/// The safety gate's author-facing outcome (`authorModerationPayload`, web
/// `src/lib/safety/gate/authorNotice.ts`).
///
/// 🚨 `title` and `detail` are SERVER TEXT, already worded in the request language, and are
/// rendered verbatim. There is deliberately no code-to-string map on this side: the notice must
/// describe the row that was actually stored, and a second wording maintained in the client is a
/// second opinion that will eventually disagree with it. Android and the web both make the same
/// choice, for the same reason.
///
/// What is deliberately absent: `safety_state`, policy identities, evidence, coverage. An author
/// who learns WHICH check held their post learns what to change to get past it.
struct ReviewModeration: Codable, Sendable, Hashable {
    let state: ReviewPublicationState
    let title: String
    let detail: String
    /// True only for an actual finding — a hold for "could not be checked" is not an accusation
    /// and must not be presented as one.
    let assertsViolation: Bool

    enum CodingKeys: String, CodingKey {
        case state, title, detail, assertsViolation
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? c.decode(ReviewPublicationState.self, forKey: .state)) ?? .unknown
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        detail = (try? c.decode(String.self, forKey: .detail)) ?? ""
        assertsViolation = (try? c.decode(Bool.self, forKey: .assertsViolation)) ?? false
    }
}

struct CreateReviewResponse: Decodable, Sendable {
    let ok: Bool?
    let isVerified: Bool?
    let error: String?
    /// 🚨 `ok: true` DOES NOT MEAN PUBLISHED. The row was stored; whether it is public is this
    /// field's business. iOS read only `ok`/`error` and set `success = true` for a review the
    /// gate had just held — the "it uploaded fine and then vanished" experience the gate exists
    /// to prevent. `nil` means the gate is inactive, which must stay indistinguishable from the
    /// world before the gate existed.
    let moderation: ReviewModeration?

    enum CodingKeys: String, CodingKey {
        case ok
        case isVerified = "is_verified"
        case error
        case moderation
    }
}

struct MusicTracksPage: Decodable, Sendable {
    let tracks: [MusicTrack]
    let page: Int?
    let limit: Int?
    let hasMore: Bool
}

struct MusicCategoriesResponse: Decodable, Sendable {
    let categories: [MusicCategory]
}

// MARK: - Review creation payload

struct CreateReviewPayload: Encodable, Sendable {
    let placeId: String
    let placeName: String
    let placeAddress: String
    let rating: Int
    let body: String
    let photos: [String]?
    let contentType: String?
    let mediaUrl: String?
    let thumbnail: String?
    let sourceType: String?
    let sourceUrl: String?
    let hashtags: [String]?
    let music: MusicPayload?
    let duration: Double?

    enum CodingKeys: String, CodingKey {
        case placeId, placeName, placeAddress, rating, body, photos
        case contentType = "content_type"
        case mediaUrl = "media_url"
        case thumbnail
        case sourceType = "source_type"
        case sourceUrl = "source_url"
        case hashtags, music, duration
    }
}

struct MusicPayload: Encodable, Sendable {
    let version: Int = 1
    let trackId: String
    let startSec: Int
    let volume: Double
}

// MARK: - Upload constants (from /api/config, display-only)

enum UploadLimits {
    static let maxPhotosPerReview = 6
    /// Binary megabytes, matching Web `MAX_VIDEO_SIZE_MB`: 150 means 157,286,400 bytes, and the
    /// ceiling is inclusive. Raised 50 → 150 alongside the five-minute clip length.
    static let maxVideoSizeMB = 150
    /// Advertised clip length — what the user is told (Web product.ts MAX_VIDEO_DURATION_SEC).
    static let maxVideoDurationSec = 300
    /// Tolerant reject threshold: a clip trimmed to "5 minutes" routinely encodes slightly above.
    /// Validation boundary only (Web MAX_VIDEO_DURATION_ACCEPT_SEC) — UI copy says five minutes,
    /// and only the failure message names 5:05.
    static let maxVideoDurationAcceptSec = 305

    /// Mirrors `isAcceptableVideoDuration` in Web `src/lib/config/product.ts`. An unreadable
    /// duration (0, negative, NaN, infinite) is rejected rather than treated as "short enough".
    static func isAcceptableVideoDuration(_ seconds: Double) -> Bool {
        guard seconds.isFinite, seconds > 0 else { return false }
        return seconds <= Double(maxVideoDurationAcceptSec)
    }
    static let maxVideoSizeBytes = maxVideoSizeMB * 1024 * 1024
    static let maxPhotoSizeBytes = 5 * 1024 * 1024
    static let maxBodyLength = 1000
    static let maxPlaceNameLength = 100
    static let allowedVideoTypes = ["video/mp4", "video/quicktime", "video/webm"]

    static let ratingLabels = ["", "Tệ", "Không tốt", "Bình thường", "Tốt", "Tuyệt vời"]
}
