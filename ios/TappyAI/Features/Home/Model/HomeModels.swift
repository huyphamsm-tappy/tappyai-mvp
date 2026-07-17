import Foundation

struct SuggestedPromptsResponse: Decodable, Sendable {
    let prompts: [SuggestedPrompt]
}

struct SuggestedPrompt: Decodable, Sendable, Identifiable {
    let text: String
    let category: String?
    let emoji: String?

    var id: String { text }
}

struct ConversationSummary: Decodable, Sendable, Identifiable {
    let id: String
    let title: String?
    let category: String?
    let updatedAt: Date?
    let messageCount: Int

    private enum CodingKeys: String, CodingKey {
        case id, title, category, updatedAt, messages
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt)
        if let arr = try? c.nestedUnkeyedContainer(forKey: .messages) {
            messageCount = arr.count ?? 0
        } else {
            messageCount = 0
        }
    }
}
