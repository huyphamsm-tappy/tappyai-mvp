import Foundation

// AI Planner — the plans Tappy has made in the user's conversations. iOS port of web
// `src/lib/planner/derivePlans.ts` (rc/web-uat). Web's page reads Supabase directly; the native
// source is `GET /api/conversations` (on production too): newest first, `.limit(20)`, each row
// with its `messages[{role, content}]` verbatim, `[TAPPY_PLAN]` blocks included.

/// One `GET /api/conversations` row, as the planner needs it.
struct PlannerConversation: Decodable, Sendable, Equatable {
    let id: String
    let title: String?
    /// ISO-8601 text; kept as a string so an unexpected format never fails the whole list.
    let updatedAt: String?
    let messages: [Message]

    struct Message: Decodable, Sendable, Equatable {
        let role: String
        let content: String
    }

    private enum CodingKeys: String, CodingKey { case id, title, updatedAt, messages }

    init(id: String, title: String?, updatedAt: String?, messages: [Message]) {
        self.id = id; self.title = title; self.updatedAt = updatedAt; self.messages = messages
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? nil
        updatedAt = (try? c.decodeIfPresent(String.self, forKey: .updatedAt)) ?? nil
        // A malformed message costs only itself, never the row or the whole planner.
        messages = c.lossyArray(Message.self, forKey: .messages)
    }
}

enum PlanKind: String, Sendable, Equatable, CaseIterable {
    case trip, evening
}

/// A plan found in a conversation (web `DerivedPlan`).
struct DerivedPlan: Identifiable, Sendable, Equatable {
    /// `<conversationId>#<messageIndex>` — one conversation may hold several plans.
    let id: String
    let conversationId: String
    let title: String
    let kind: PlanKind?
    let updatedAt: Date?
    let people: Int?
    let budgetTotal: String?
    let dayCount: Int
    let stopCount: Int
    /// De-duplicated, first-seen order.
    let categories: [String]
    /// The first stop photo, if any.
    let coverUrl: String?
    /// The first three stops, for the card preview.
    let stops: [TappyPlan.PlanItem]
    let plan: TappyPlan
}

enum PlannerDerivation {
    static let previewStops = 3

    /// Web `derivePlans`: conversations in server order (newest first); within one, plans in
    /// message order. Only assistant messages with a `[TAPPY_PLAN]` block the parser accepts count.
    /// A plan with no title and no conversation title is skipped.
    static func derivePlans(_ rows: [PlannerConversation]) -> [DerivedPlan] {
        var out: [DerivedPlan] = []
        for row in rows {
            for (index, message) in row.messages.enumerated() {
                guard message.role == "assistant", message.content.contains("[TAPPY_PLAN]"),
                      let plan = ContentParser.parsePlan(message.content).plan else { continue }
                let fallback = row.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let title = plan.title.isEmpty ? fallback : plan.title
                guard !title.isEmpty else { continue }
                let items = plan.days.flatMap(\.items)
                var seen = Set<String>()
                let categories = items.map(\.category).filter { !$0.isEmpty && seen.insert($0).inserted }
                out.append(DerivedPlan(
                    id: "\(row.id)#\(index)",
                    conversationId: row.id,
                    title: title,
                    kind: plan.type.flatMap(PlanKind.init(rawValue:)),
                    updatedAt: row.updatedAt.flatMap(parseDate),
                    people: plan.people,
                    budgetTotal: plan.budgetTotal,
                    dayCount: plan.days.count,
                    stopCount: items.count,
                    categories: categories,
                    coverUrl: items.lazy.compactMap(\.photoUrl).first,
                    stops: Array(items.prefix(previewStops)),
                    plan: plan
                ))
            }
        }
        return out
    }

    /// Web `plannerFacets`: the kinds actually present, and only when there is more than one —
    /// otherwise the chip row is hidden.
    static func facets(_ plans: [DerivedPlan]) -> [PlanKind] {
        let present = PlanKind.allCases.filter { kind in plans.contains { $0.kind == kind } }
        return present.count > 1 ? present : []
    }

    static func filter(_ plans: [DerivedPlan], kind: PlanKind?) -> [DerivedPlan] {
        guard let kind else { return plans }
        return plans.filter { $0.kind == kind }
    }

    static func parseDate(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    }
}

struct PlannerService {
    let api: APIClient

    func conversations() async throws -> [PlannerConversation] {
        let endpoint = Endpoint(path: "/api/conversations", method: .get, requiresAuth: true)
        return try await api.send(endpoint, as: LossyList<PlannerConversation>.self).items
    }
}
