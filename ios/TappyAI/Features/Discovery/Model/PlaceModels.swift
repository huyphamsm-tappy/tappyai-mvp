import Foundation

struct ServiceDetail: Hashable {
    let id: String
    let name: String
    let address: String
    let type: String
    let phone: String
    let price: String
    let rating: String
    let hours: String
    let mapsLink: String
    let note: String
    let placeId: String
}

struct Favorite: Identifiable, Codable {
    let id: String
    let placeId: String
    let placeName: String
    let placeAddress: String
    let placeType: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case placeId = "place_id"
        case placeName = "place_name"
        case placeAddress = "place_address"
        case placeType = "place_type"
        case createdAt = "created_at"
    }
}

struct SavedReview: Identifiable, Codable {
    let id: String
    let placeName: String?
    let body: String?
    let photos: [String]?
    let thumbnail: String?
    let contentType: String?
    let savedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case placeName = "place_name"
        case body, photos, thumbnail
        case contentType = "content_type"
        case savedAt = "saved_at"
    }
}

struct Recommendation: Identifiable, Codable {
    let placeId: String
    let placeName: String
    let finalScore: Double
    let matchedSignals: [String]

    var id: String { placeId }
}

struct Booking: Identifiable, Codable {
    let id: String
    let date: String
    let time: String?
    let guests: Int
    let status: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, date, time, guests, status
        case createdAt = "created_at"
    }

    var statusLabel: String {
        switch status {
        case "confirmed": return "Da xac nhan"
        case "cancelled": return "Da huy"
        default: return "Cho xac nhan"
        }
    }
}

struct TappyReview: Identifiable, Codable {
    let id: String
    let rating: Int
    let body: String
    let createdAt: String
    let photos: [String]?

    enum CodingKeys: String, CodingKey {
        case id, rating, body, photos
        case createdAt = "created_at"
    }
}

struct CategoryMeta {
    let emoji: String
    let label: String

    static let map: [String: CategoryMeta] = [
        "food": CategoryMeta(emoji: "🍜", label: "Ăn uống"),
        "spa": CategoryMeta(emoji: "💆", label: "Spa & Làm đẹp"),
        "hotel": CategoryMeta(emoji: "🏨", label: "Khách sạn"),
        "travel": CategoryMeta(emoji: "✈️", label: "Du lịch"),
        "shopping": CategoryMeta(emoji: "🛍️", label: "Mua sắm"),
        "entertainment": CategoryMeta(emoji: "🎉", label: "Giải trí"),
    ]

    static func get(_ type: String) -> CategoryMeta {
        map[type] ?? CategoryMeta(emoji: "🍜", label: "Ăn uống")
    }
}

struct PlatformLink: Identifiable {
    let name: String
    let url: String
    var id: String { name }
}
