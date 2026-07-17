import Foundation

// MARK: - Message

struct ChatMessage: Identifiable, Equatable, Sendable {
    let id: String
    let role: MessageRole
    var content: String
    var status: MessageStatus
    var toolInvocations: [ToolInvocation]

    init(id: String = UUID().uuidString, role: MessageRole, content: String,
         status: MessageStatus = .complete, toolInvocations: [ToolInvocation] = []) {
        self.id = id
        self.role = role
        self.content = content
        self.status = status
        self.toolInvocations = toolInvocations
    }

    var isUser: Bool { role == .user }
    var isAssistant: Bool { role == .assistant }
}

enum MessageRole: String, Sendable, Codable {
    case user, assistant
}

enum MessageStatus: Equatable, Sendable {
    case sending
    case streaming
    case complete
    case failed
}

// MARK: - Tool invocations (rendered per Web behavior)

struct ToolInvocation: Equatable, Sendable, Identifiable {
    let id: String
    let toolName: String
    var state: ToolState

    enum ToolState: Equatable, Sendable {
        case calling
        case result(Data)
    }
}

// MARK: - Content parsing (matches Web's parseCTA / parsePlan / parseFollowups)

struct ParsedContent: Equatable, Sendable {
    let text: String
    let ctaButtons: [CTAButton]
    let plan: TappyPlan?
    let followups: [String]
    let images: [ParsedImage]
}

struct ParsedImage: Equatable, Sendable, Identifiable {
    let alt: String
    let url: String
    var id: String { url }
}

struct CTAButton: Equatable, Sendable, Identifiable {
    let label: String
    let type: String
    let url: String
    let primary: Bool
    var id: String { "\(label)-\(url)" }
}

struct TappyPlan: Equatable, Sendable, Decodable {
    let days: [PlanDay]

    struct PlanDay: Equatable, Sendable, Decodable {
        let day: Int?
        let title: String?
        let activities: [Activity]?

        struct Activity: Equatable, Sendable, Decodable {
            let time: String?
            let title: String?
            let description: String?
            let cost: String?
        }
    }
}

// MARK: - Conversation CRUD

struct Conversation: Decodable, Sendable, Identifiable {
    let id: String
    let title: String?
    let category: String?
    let messages: [ConversationMessage]

    struct ConversationMessage: Decodable, Sendable {
        let role: String
        let content: String
    }
}

struct SaveConversationRequest: Encodable, Sendable {
    let title: String
    let category: String
    let messages: [MessagePayload]
}

struct UpdateConversationRequest: Encodable, Sendable {
    let id: String
    let title: String
    let messages: [MessagePayload]
}

struct MessagePayload: Encodable, Sendable {
    let role: String
    let content: String
}

// MARK: - Chat request body (matches Web's /api/chat POST)

struct ChatRequest: Encodable, Sendable {
    let messages: [MessagePayload]
    var userLocation: LocationPayload?

    struct LocationPayload: Encodable, Sendable {
        let lat: Double
        let lng: Double
        let address: String
    }
}

// MARK: - Tool hint mapping (matches Web TOOL_HINTS)

enum ToolHints {
    static let hints: [String: (vi: String, en: String)] = [
        "search_places":         ("🔎 Đang tìm địa điểm…",       "🔎 Searching places…"),
        "search_products":       ("🛍️ Đang tìm sản phẩm…",      "🛍️ Searching products…"),
        "get_weather":           ("⛅ Đang xem thời tiết…",       "⛅ Checking the weather…"),
        "get_gold_price":        ("🪙 Đang tra giá vàng…",        "🪙 Checking gold prices…"),
        "get_flight_prices":     ("✈️ Đang tìm vé máy bay…",     "✈️ Finding flights…"),
        "get_hotel_prices":      ("🏨 Đang tìm khách sạn…",      "🏨 Finding hotels…"),
        "get_transport_options": ("🚗 Đang tìm cách di chuyển…",  "🚗 Finding transport…"),
        "get_news":              ("📰 Đang đọc tin tức…",          "📰 Reading the news…"),
        "web_search":            ("🌐 Đang tìm trên web…",        "🌐 Searching the web…"),
        "save_price_watch":      ("🔔 Đang đặt theo dõi giá…",    "🔔 Setting up price watch…"),
    ]

    static func hint(for tool: String, locale: String) -> String? {
        guard let pair = hints[tool] else { return nil }
        return locale == "en" ? pair.en : pair.vi
    }
}
