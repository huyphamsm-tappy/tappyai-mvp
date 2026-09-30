import Foundation

// MARK: - Message

struct ChatMessage: Identifiable, Equatable, Sendable {
    let id: String
    let role: MessageRole
    var content: String
    var status: MessageStatus
    var toolInvocations: [ToolInvocation]
    /// The LIVE place decision for this turn, from the `8:` annotation.
    ///
    /// Session-only, and deliberately NOT part of `content`: the chat persists `{role, content}`,
    /// so this cannot survive a reload and is not meant to. A reopened conversation falls back to
    /// the durable `[TAPPY_PLACES]` block inside the text, which is what that block exists for.
    var livePlaces: PlacesLiveView?
    /// The same decision projected for the share artifact (`SharePlacesView(from:)`). In memory
    /// for the session; never persisted — Places data is live-only, and `persistConversation`
    /// sends `content` alone.
    var placesView: SharePlacesView? = nil

    init(id: String = UUID().uuidString, role: MessageRole, content: String,
         status: MessageStatus = .complete, toolInvocations: [ToolInvocation] = [],
         livePlaces: PlacesLiveView? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.status = status
        self.toolInvocations = toolInvocations
        self.livePlaces = livePlaces
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
    /// D1 — the decoded shopping decision, or nil when the turn carried none.
    /// Defaulted so existing call sites that build a ParsedContent keep compiling unchanged.
    var shopping: ShoppingDecisionView? = nil
    /// The `[TAPPY_PLAN]` block VERBATIM (the JSON between the tags), present exactly when `plan`
    /// is. A plan SHARE sends this to `POST /api/plans/share` — the real payload the model emitted,
    /// including fields `TappyPlan` does not model (the wire `label`/`items`/`photo_url`), so the
    /// recipient's brochure is the whole plan. The server whitelists it before storing anything.
    var planJSON: String? = nil
    /// The DURABLE place cards carried by `[TAPPY_PLACES]`, best first. Empty on every turn that
    /// carried none — which today is every turn, because the server emits the block only when
    /// `EMIT_TAPPY_PLACES` is on. Parsing it now is what lets that flag be flipped without raw JSON
    /// reaching a user, which is how `[TAPPY_SHOPPING]` and `[CTA_BUTTONS]` both leaked before.
    var places: [PersistedPlace] = []
    /// Consult ASK questions (`[TAPPY_ASK]`), shown as `AskCardView` on the last reply. Empty on
    /// every other turn.
    var ask: [AskQuestion] = []
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

/// The `[TAPPY_PLAN]` block, in the shape the backend emits (the planning prompt in
/// `src/lib/ai/promptBuilder.ts`; web type `TappyPlan` in `src/components/TripPlanCard.tsx`;
/// Android `chat/ChatResponse.kt`):
///
///     {"type","title","people","budget_total","days":[{"label","items":[{"time","emoji",
///      "category","name","description","price","address","maps_link","booking_link",
///      "place_id","photo_url"}]}],"cost_breakdown":{…},"share_text","local_tips":[…]}
///
/// Required: `days`, and `items` on every day — a block without them does not decode, so a plan
/// in another shape can never turn into days with nothing in them. An item without a `name` is
/// dropped (web `derivePlans` / the share snapshot do the same). Prices go through
/// `PlanPrice.amount`, like web `projectPlanPrices`: a sentinel such as "chưa có giá" is not a price.
struct TappyPlan: Equatable, Sendable, Decodable {
    let type: String?
    /// May be empty: the model usually writes one, but only `days` is validated server-side.
    let title: String
    let people: Int?
    let budgetTotal: String?
    let days: [PlanDay]
    let costBreakdown: [String: String]?
    let shareText: String?
    let localTips: [LocalTip]?

    struct PlanDay: Equatable, Sendable, Decodable {
        /// "Ngày 1", "Tối nay"… Empty when the block has none; surfaces fall back to "Day N".
        let label: String
        let items: [PlanItem]

        private enum CodingKeys: String, CodingKey { case label, items }

        init(label: String, items: [PlanItem]) {
            self.label = label
            self.items = items
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            label = ((try? c.decodeIfPresent(String.self, forKey: .label)) ?? nil)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            // Required: a day without `items` is not a plan day.
            items = try c.decode([Lossy<PlanItem>].self, forKey: .items).compactMap(\.value)
        }
    }

    struct PlanItem: Equatable, Sendable, Decodable {
        let time: String
        let emoji: String
        let category: String
        let name: String
        let description: String?
        let price: String?
        let address: String?
        let mapsLink: String?
        let bookingLink: String?
        let placeId: String?
        let photoUrl: String?

        private enum CodingKeys: String, CodingKey {
            case time, emoji, category, name, description, price, address
            case mapsLink = "maps_link", bookingLink = "booking_link"
            case placeId = "place_id", photoUrl = "photo_url"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            func text(_ key: CodingKeys) -> String? {
                guard let raw = (try? c.decodeIfPresent(String.self, forKey: key)) ?? nil else { return nil }
                let v = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                return v.isEmpty ? nil : v
            }
            guard let name = text(.name) else {
                throw DecodingError.keyNotFound(CodingKeys.name, .init(codingPath: c.codingPath,
                                                                       debugDescription: "plan item without a name"))
            }
            self.name = name
            time = text(.time) ?? ""
            emoji = text(.emoji) ?? ""
            category = text(.category) ?? ""
            description = text(.description)
            price = PlanPrice.amount(text(.price))
            address = text(.address)
            mapsLink = text(.mapsLink)
            bookingLink = text(.bookingLink)
            placeId = text(.placeId)
            photoUrl = text(.photoUrl)
        }
    }

    struct LocalTip: Equatable, Sendable, Decodable {
        let text: String
        /// "tool" | "general"
        let basis: String
        let place: String?
    }

    private enum CodingKeys: String, CodingKey {
        case type, title, people, days
        case budgetTotal = "budget_total", costBreakdown = "cost_breakdown"
        case shareText = "share_text", localTips = "local_tips"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // Required: the one field web `parsePlan` validates. Per DAY it is lossy: a malformed day
        // (no `items` array) is dropped and the rest of the plan still renders. A day whose `items`
        // is empty is well-formed and stays — the backend emits one (e.g. a trailing "Chi tiết chi
        // phí"). When EVERY day is malformed — a block in another shape — it is not a plan.
        let entries = try c.decode([Lossy<PlanDay>].self, forKey: .days)
        let decoded = entries.compactMap(\.value)
        guard entries.isEmpty || !decoded.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .days, in: c, debugDescription: "no well-formed plan day")
        }
        days = decoded
        type = (try? c.decodeIfPresent(String.self, forKey: .type)) ?? nil
        title = ((try? c.decodeIfPresent(String.self, forKey: .title)) ?? nil)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let people = (try? c.decodeIfPresent(Int.self, forKey: .people)) ?? nil
        self.people = (people ?? 0) > 0 ? people : nil
        budgetTotal = PlanPrice.amount((try? c.decodeIfPresent(String.self, forKey: .budgetTotal)) ?? nil)
        let breakdown = ((try? c.decodeIfPresent([String: String].self, forKey: .costBreakdown)) ?? nil)?
            .compactMapValues { PlanPrice.amount($0) } ?? [:]
        costBreakdown = breakdown.isEmpty ? nil : breakdown
        let share = ((try? c.decodeIfPresent(String.self, forKey: .shareText)) ?? nil)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        shareText = (share?.isEmpty ?? true) ? nil : share
        let tips: [Lossy<LocalTip>]? = (try? c.decodeIfPresent([Lossy<LocalTip>].self, forKey: .localTips)) ?? nil
        localTips = tips?.compactMap(\.value)
    }

    /// Decodes an element or yields nil, so one malformed element does not sink the whole array.
    private struct Lossy<T: Decodable & Sendable>: Decodable, Sendable {
        let value: T?
        init(from decoder: Decoder) throws { value = try? T(from: decoder) }
    }
}

/// What the plan card shows beyond the days — the same pieces as web `TripPlanCard`.
enum PlanCardContent {
    /// "3 người · 2.500.000đ": people (only when more than one) and the budget, joined so a
    /// missing half leaves no dangling separator. Nil when neither exists.
    static func summary(_ plan: TappyPlan) -> String? {
        var parts: [String] = []
        if let people = plan.people, people > 1 {
            parts.append(String(format: NSLocalizedString("chat.plan.people", comment: ""), people))
        }
        if let budget = plan.budgetTotal { parts.append(budget) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// Tips with text; a "tool" tip keeps its place, anything else is general advice.
    static func tips(_ plan: TappyPlan) -> [(place: String?, text: String)] {
        (plan.localTips ?? []).compactMap { tip in
            let text = tip.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            let place = tip.place?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (tip.basis == "tool" && !(place ?? "").isEmpty ? place : nil, text)
        }
    }

    /// A Maps / booking link the card may open: http(s) with a host, else nil.
    static func link(_ raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              url.host?.isEmpty == false
        else { return nil }
        return url
    }
}

/// A plan price is shown only when it IS a price — port of web `planAmount`
/// (`src/lib/plans/planPrice.ts`) and Android `PlanPrice.kt`. A value is kept when it has a digit
/// or says the thing is free; the model's "no price" sentinels are dropped, never rewritten.
enum PlanPrice {
    private static let noPrice = try! NSRegularExpression(
        pattern: #"chưa\s*có\s*giá|chưa\s*rõ\s*giá|không\s*rõ\s*giá|price\s*not\s*available|no\s*price|\bn/a\b|\bunknown\b"#,
        options: [.caseInsensitive])
    private static let free = try! NSRegularExpression(
        pattern: #"^(?:miễn\s*phí|free)(?!\p{L})"#, options: [.caseInsensitive])

    static func amount(_ raw: String?) -> String? {
        guard let v = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else { return nil }
        let range = NSRange(v.startIndex..., in: v)
        if noPrice.firstMatch(in: v, range: range) != nil { return nil }
        if v.rangeOfCharacter(from: .decimalDigits) != nil { return v }
        if free.firstMatch(in: v, range: range) != nil { return v }
        return nil
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

/// Lenient: a conversation needs an id; a message that does not decode is dropped (one broken
/// turn must not make the whole history unopenable), and a POST answer without messages is fine.
extension Conversation {
    enum CodingKeys: String, CodingKey { case id, title, category, messages }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        title = c.lenient(String.self, forKey: .title)
        category = c.lenient(String.self, forKey: .category)
        messages = c.lossyArray(ConversationMessage.self, forKey: .messages)
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
