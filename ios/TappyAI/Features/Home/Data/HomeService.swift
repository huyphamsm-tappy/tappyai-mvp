import Foundation

final class HomeService: Sendable {
    private let api: APIClient
    private let decoder: JSONDecoder

    init(api: APIClient) {
        self.api = api
        self.decoder = ResponseDecoder.json
    }

    func suggestedPrompts() async throws -> [SuggestedPrompt] {
        let endpoint = Endpoint(path: "/api/suggested-prompts", method: .get, requiresAuth: false)
        let data = try await api.send(endpoint)
        let response = try decoder.decode(SuggestedPromptsResponse.self, from: data)
        return response.prompts
    }

    func conversations() async throws -> [ConversationSummary] {
        let endpoint = Endpoint(path: "/api/conversations", method: .get, requiresAuth: true)
        return try await api.send(endpoint, as: [ConversationSummary].self)
    }
}
