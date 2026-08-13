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

    static func detect(url: String) -> ExternalSource? {
        let lower = url.lowercased()
        if lower.contains("youtube.com") || lower.contains("youtu.be") { return .youtube }
        if lower.contains("tiktok.com") { return .tiktok }
        if lower.contains("facebook.com") || lower.contains("fb.com") || lower.contains("fb.watch") { return .facebook }
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

struct CreateReviewResponse: Decodable, Sendable {
    let ok: Bool?
    let isVerified: Bool?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case ok
        case isVerified = "is_verified"
        case error
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
    static let maxVideoSizeMB = 50
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
