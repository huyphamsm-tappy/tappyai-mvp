import Foundation

struct UserProfile: Codable {
    var fullName: String
    var avatarUrl: String
    var email: String
    var bio: String
    var language: String?
    /// The profile cover photo (`cover_url`); nil/empty = none. Upload ≤5 MB, cleared by PATCH.
    var coverUrl: String? = nil
    /// Whether the server's GET /api/profile carries a `cover_url` key at all (null counts). Production's profile row has no such key and its
    /// POST has no `cover` field (400), so the cover section is offered only when this is true (Web edit/page.tsx: `profile.cover_url !== undefined`).
    var supportsCover: Bool = false

    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case avatarUrl = "avatar_url"
        case email
        case bio
        case language
        case coverUrl = "cover_url"
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

// MARK: - Lenient decoding (LenientDecoding.swift): identity required, everything else defaulted.
// In extensions so the memberwise initialisers stay available.

extension UserProfile {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        fullName = c.lenient(String.self, forKey: .fullName, default: "")
        avatarUrl = c.lenient(String.self, forKey: .avatarUrl, default: "")
        email = c.lenient(String.self, forKey: .email, default: "")
        bio = c.lenient(String.self, forKey: .bio, default: "")
        language = c.lenient(String.self, forKey: .language)
        coverUrl = c.lenient(String.self, forKey: .coverUrl)
        supportsCover = c.contains(.coverUrl)
    }
}

extension UserMemory {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        locationBase = c.lenient(String.self, forKey: .locationBase)
        companions = c.lenient(String.self, forKey: .companions)
        timing = c.lenient(String.self, forKey: .timing)
        personality = c.lenient(String.self, forKey: .personality)
        preferences = c.lenient(MemoryPreferences.self, forKey: .preferences)
            ?? MemoryPreferences(food: nil, spa: nil, entertainment: nil, shopping: nil, avoid: nil)
        // One malformed budget entry drops that entry only.
        let rawBudget = c.lenient([String: LossyElement<BudgetRange>].self, forKey: .budget) ?? [:]
        budget = rawBudget.compactMapValues(\.value)
        history = c.lossyArray(String.self, forKey: .history)
        updatedAt = c.lenient(String.self, forKey: .updatedAt)
    }
}

extension BudgetRange {
    enum CodingKeys: String, CodingKey { case min, max }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let lo = c.lenientInt(forKey: .min) ?? c.lenientInt(forKey: .max),
              let hi = c.lenientInt(forKey: .max) ?? c.lenientInt(forKey: .min) else {
            throw DecodingError.dataCorrupted(.init(codingPath: c.codingPath, debugDescription: "budget without bounds"))
        }
        min = lo
        max = hi
    }
}

extension ChatHistoryItem {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        title = c.lenient(String.self, forKey: .title, default: "")
        category = c.lenient(String.self, forKey: .category)
        updatedAt = c.lenient(String.self, forKey: .updatedAt, default: "")
        messages = c.lenient([AnyCodable].self, forKey: .messages)
    }
}

extension PriceWatch {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        productName = c.lenient(String.self, forKey: .productName, default: "")
        targetPrice = c.lenientInt(forKey: .targetPrice) ?? 0
        currentPrice = c.lenientInt(forKey: .currentPrice)
        status = c.lenient(String.self, forKey: .status, default: "")
        lastChecked = c.lenient(String.self, forKey: .lastChecked)
        notifiedAt = c.lenient(String.self, forKey: .notifiedAt)
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
    }
}

extension PriceWatchResponse {
    enum CodingKeys: String, CodingKey { case watches }
    init(from decoder: Decoder) throws {
        watches = try decoder.container(keyedBy: CodingKeys.self).lossyArray(PriceWatch.self, forKey: .watches)
    }
}

extension PreferencesResponse {
    enum CodingKeys: String, CodingKey { case preferences, structured }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        preferences = c.lossyArray(String.self, forKey: .preferences)
        structured = c.lenient(StructuredPreferences.self, forKey: .structured)
    }
}

extension Integration {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        provider = try c.decode(String.self, forKey: .provider)
        connected = c.lenient(Bool.self, forKey: .connected, default: false)
        metadata = c.lenient(IntegrationMeta.self, forKey: .metadata)
        connectedAt = c.lenient(String.self, forKey: .connectedAt)
    }
}

extension IntegrationsResponse {
    enum CodingKeys: String, CodingKey { case integrations }
    init(from decoder: Decoder) throws {
        integrations = try decoder.container(keyedBy: CodingKeys.self).lossyArray(Integration.self, forKey: .integrations)
    }
}

extension ProfileBooking {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        serviceName = c.lenient(String.self, forKey: .serviceName, default: "")
        serviceType = c.lenient(String.self, forKey: .serviceType, default: "")
        customerName = c.lenient(String.self, forKey: .customerName, default: "")
        customerPhone = c.lenient(String.self, forKey: .customerPhone, default: "")
        date = c.lenient(String.self, forKey: .date, default: "")
        time = c.lenient(String.self, forKey: .time)
        guests = c.lenientInt(forKey: .guests) ?? 1
        status = c.lenient(String.self, forKey: .status, default: "pending")
        notes = c.lenient(String.self, forKey: .notes)
        placeId = c.lenient(String.self, forKey: .placeId)
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
    }
}

extension ProfileBookingsResponse {
    enum CodingKeys: String, CodingKey { case bookings }
    init(from decoder: Decoder) throws {
        bookings = try decoder.container(keyedBy: CodingKeys.self).lossyArray(ProfileBooking.self, forKey: .bookings)
    }
}

extension PlaceReviewsResponse {
    enum CodingKeys: String, CodingKey { case reviews }
    init(from decoder: Decoder) throws {
        reviews = try decoder.container(keyedBy: CodingKeys.self).lossyArray(PlaceReviewAuthor.self, forKey: .reviews)
    }
}

enum ProfileDestination: Hashable {
    /// The hub's short «Tài khoản» row: opens the list of personal sections (`AccountMenuView`).
    case accountMenu
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
    /// Feature usage guidance — the native counterpart of the web's /how-to-use.
    case howToUse
    /// The author's own posts — the native counterpart of the web's /profile/posts and Android's
    /// My Reviews. Release-critical rather than convenient: it is where a post the safety gate
    /// held stays visible to its author, with the reason. See `MyPostsView`.
    case myPosts
    /// The notification inbox — counterpart of Android's notifications screen. Distinct from
    /// [notifications], which is the SETTINGS screen for delivery preferences.
    case notificationsInbox
    /// People search — the counterpart of Android's ReviewSearchSection and the web user search.
    case userSearch
    /// AI Planner — the plans found in the user's conversations (web `/planner`).
    case planner
    /// Following / Followers — the counterpart of the web's `/social`.
    case social
    /// Group dining — the counterpart of Android's GroupDiningScreen and the web's `/group/new`.
    ///
    /// 🚨 Was NOT a destination at all: the row called `UIApplication.shared.open` on a hardcoded
    /// `https://tappyai.vn/group/new`. That left the app, landed on a domain that is not the
    /// canonical origin, and arrived signed-out — where `/group/new` redirects to `/login`. The
    /// feature existed as a row and nowhere else.
    case groupDining
    /// Settings → Tài khoản đã chặn (App Store 1.2). Only reachable while the server's `p8.userBlocks` is on.
    case blockedAccounts
}
