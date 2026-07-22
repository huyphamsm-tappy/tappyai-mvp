import Foundation

// MARK: - Sound page data (GET /api/sound/[trackId])

struct SoundData: Decodable, Sendable {
    let track: SoundTrack
    let usageCount: Int
    let savedCount: Int
    let savedByMe: Bool
    let followCount: Int
    let followedByMe: Bool
    let trendingRank: Int?
    let videos: [SoundVideo]
}

struct SoundTrack: Decodable, Sendable {
    let id: String
    let title: String
    let artist: String?
    let durationSec: Int
    let coverUrl: String?
    let previewUrl: String?
    let audioUrl: String
    let musicType: String
    let playCount: Int
}

struct SoundVideo: Decodable, Sendable, Identifiable {
    let id: String
    let placeName: String
    let body: String
    let thumbnail: String?
    let contentType: String
    let likeCount: Int
}

// MARK: - Music type labels (matches Web TYPE_LABEL)

enum MusicTypeLabel {
    static let labels: [String: String] = [
        "royalty_free": "Miễn phí bản quyền",
        "licensed": "Có bản quyền",
        "original_sound": "Âm thanh gốc",
        "ai_generated": "AI tạo nhạc",
        "external": "Liên kết ngoài",
    ]

    static func label(for type: String) -> String {
        labels[type] ?? type
    }
}

// MARK: - Report reasons (matches Web REASONS)

enum ReportReason: String, CaseIterable, Sendable {
    case copyright
    case inappropriate
    case spam
    case other

    var displayLabel: String {
        switch self {
        case .copyright: return "Vi phạm bản quyền (nhạc của tôi/người khác)"
        case .inappropriate: return "Nội dung không phù hợp"
        case .spam: return "Spam / giả mạo"
        case .other: return "Khác"
        }
    }
}

// MARK: - Report request payload

struct ReportPayload: Encodable, Sendable {
    let reason: String
    let details: String?
}

// MARK: - Upload sound payload (POST /api/music/tracks)

struct UploadSoundPayload: Encodable, Sendable {
    let title: String
    let artist: String?
    let audioUrl: String
    let durationSec: Int
    let rightsConfirmed: Bool
}

struct UploadSoundResponse: Decodable, Sendable {
    let id: String?
    let ok: Bool?
    let error: String?
}

// MARK: - Save/Follow toggle responses

struct SaveToggleResponse: Decodable, Sendable {
    let saved: Bool?
    let savedCount: Int?
    let error: String?
}

struct FollowToggleResponse: Decodable, Sendable {
    let followed: Bool?
    let followCount: Int?
    let error: String?
}

// MARK: - Upload limits for Original Sound

enum MusicUploadLimits {
    static let maxFileSizeMB = 20
    static let maxFileSizeBytes = maxFileSizeMB * 1024 * 1024
    static let maxDurationSec = 600
    static let minDurationSec = 1
    static let maxTitleLength = 120
    static let allowedExtensions = ["mp3", "m4a", "wav", "aac", "ogg", "webm"]
}
