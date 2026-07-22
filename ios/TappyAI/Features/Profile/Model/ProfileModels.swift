import Foundation

struct UserProfile: Codable {
    var fullName: String
    var avatarUrl: String
    var email: String
    var bio: String
    var language: String?

    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case avatarUrl = "avatar_url"
        case email
        case bio
        case language
    }
}

struct UserMemory: Codable {
    var locationBase: String?
    var companions: String?
    var timing: String?
    var personality: String?
    var preferences: MemoryPreferences
    var budget: [String: BudgetRange]
    var history: [String]
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case locationBase = "location_base"
        case companions, timing, personality, preferences, budget, history
        case updatedAt = "updated_at"
    }
}

struct MemoryPreferences: Codable {
    var food: [String]?
    var spa: [String]?
    var entertainment: [String]?
    var shopping: [String]?
    var avoid: [String]?
}

struct BudgetRange: Codable {
    var min: Int
    var max: Int
}

struct MemoryResponse: Codable {
    var memory: UserMemory?
}

struct ChatHistoryItem: Codable, Identifiable {
    var id: String
    var title: String
    var category: String?
    var updatedAt: String
    var messages: [AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id, title, category
        case updatedAt = "updated_at"
        case messages
    }

    var messageCount: Int {
        messages?.count ?? 0
    }
}

struct AnyCodable: Codable {
    init(from decoder: Decoder) throws {
        _ = try decoder.singleValueContainer()
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encodeNil()
    }
}

struct PriceWatch: Codable, Identifiable {
    var id: String
    var productName: String
    var targetPrice: Int
    var currentPrice: Int?
    var status: String
    var lastChecked: String?
    var notifiedAt: String?
    var createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case productName = "product_name"
        case targetPrice = "target_price"
        case currentPrice = "current_price"
        case status
        case lastChecked = "last_checked"
        case notifiedAt = "notified_at"
        case createdAt = "created_at"
    }
}

struct PriceWatchResponse: Codable {
    var watches: [PriceWatch]
}

struct PreferencesResponse: Codable {
    var preferences: [String]
    var structured: StructuredPreferences?
}

struct StructuredPreferences: Codable {
    var budgetLevel: String?
    var cuisineLikes: [String]?
    var dietaryRestrictions: String?

    enum CodingKeys: String, CodingKey {
        case budgetLevel = "budget_level"
        case cuisineLikes = "cuisine_likes"
        case dietaryRestrictions = "dietary_restrictions"
    }
}

struct Integration: Codable, Identifiable {
    var provider: String
    var connected: Bool
    var metadata: IntegrationMeta?
    var connectedAt: String?

    var id: String { provider }

    enum CodingKeys: String, CodingKey {
        case provider, connected, metadata
        case connectedAt = "connected_at"
    }
}

struct IntegrationMeta: Codable {
    var email: String?
    var name: String?
    var picture: String?
}

struct IntegrationsResponse: Codable {
    var integrations: [Integration]
}

struct ProfileBooking: Codable, Identifiable {
    let id: String
    let serviceName: String
    let serviceType: String
    let customerName: String
    let customerPhone: String
    let date: String
    let time: String?
    let guests: Int
    let status: String
    let notes: String?
    let placeId: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case serviceName = "service_name"
        case serviceType = "service_type"
        case customerName = "customer_name"
        case customerPhone = "customer_phone"
        case date, time, guests, status, notes
        case placeId = "place_id"
        case createdAt = "created_at"
    }
}

struct ProfileBookingsResponse: Codable {
    let bookings: [ProfileBooking]
}

struct PlaceReviewAuthor: Codable {
    let userId: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
    }
}

struct PlaceReviewsResponse: Codable {
    let reviews: [PlaceReviewAuthor]
}

enum ProfileDestination: Hashable {
    case account
    case editProfile
    case settings
    case history
    case bookings
    case preferences
    case favorites
    case priceWatches
    case tappyKnows
    case integrations
    case notifications
    case subscription
    case privacy
    case terms
}
