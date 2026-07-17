import Foundation

/// Chat service — handles streaming chat and conversation CRUD.
/// Streaming uses the existing `StreamingClient` (Vercel AI SDK data-stream protocol).
/// CRUD uses the existing `APIClient`.
final class ChatService: Sendable {
    private let api: APIClient
    private let streaming: StreamingClient
    private let encoder: JSONEncoder

    init(api: APIClient, streaming: StreamingClient) {
        self.api = api
        self.streaming = streaming
        self.encoder = ResponseDecoder.jsonEncoder
    }

    // MARK: - Streaming chat

    /// Streams a chat response. Returns an AsyncThrowingStream of StreamFrame.
    /// The caller (ViewModel) assembles frames into message content.
    func chat(messages: [MessagePayload]) -> AsyncThrowingStream<StreamFrame, Error> {
        let body: [String: Any] = [
            "messages": messages.map { ["role": $0.role, "content": $0.content] }
        ]
        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else {
            return AsyncThrowingStream { $0.finish(throwing: AppError.validation(message: "Failed to encode chat request")) }
        }
        let endpoint = Endpoint(
            path: "/api/chat",
            method: .post,
            body: bodyData,
            requiresAuth: true,
            timeout: 60
        )
        return streaming.stream(endpoint)
    }

    // MARK: - Conversation CRUD

    func loadConversation(id: String) async throws -> Conversation {
        let endpoint = Endpoint(
            path: "/api/conversations",
            method: .get,
            requiresAuth: true
        )
        let all = try await api.send(endpoint, as: [Conversation].self)
        guard let conversation = all.first(where: { $0.id == id }) else {
            throw AppError.validation(message: "Conversation not found")
        }
        return conversation
    }

    func saveConversation(title: String, category: String, messages: [MessagePayload]) async throws -> Conversation {
        let request = SaveConversationRequest(title: title, category: category, messages: messages)
        let endpoint = Endpoint(
            path: "/api/conversations",
            method: .post,
            body: try encoder.encode(request),
            requiresAuth: true
        )
        return try await api.send(endpoint, as: Conversation.self)
    }

    func updateConversation(id: String, title: String, messages: [MessagePayload]) async throws {
        let request = UpdateConversationRequest(id: id, title: title, messages: messages)
        let endpoint = Endpoint(
            path: "/api/conversations",
            method: .put,
            body: try encoder.encode(request),
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }

    func deleteConversation(id: String) async throws {
        let endpoint = Endpoint(
            path: "/api/conversations",
            method: .delete,
            query: [URLQueryItem(name: "id", value: id)],
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }

    // MARK: - Memory (badge indicator)

    func checkMemory() async -> Bool {
        let endpoint = Endpoint(path: "/api/memory", method: .get, requiresAuth: true)
        guard let result = try? await api.send(endpoint, as: MemoryCheckResponse.self) else { return false }
        return result.memory != nil
    }

    // MARK: - Message feedback (like/dislike/report)

    func saveFeedback(conversationId: String, messageIndex: Int, type: String, reason: String? = nil) async {
        var body: [String: Any] = [
            "conversationId": conversationId,
            "messageIndex": messageIndex,
            "type": type,
        ]
        if let reason { body["reason"] = reason }
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        let endpoint = Endpoint(path: "/api/message-feedback", method: .post, body: data, requiresAuth: true)
        _ = try? await api.send(endpoint)
    }

    func deleteFeedback(conversationId: String, messageIndex: Int, type: String) async {
        let body: [String: Any] = [
            "conversationId": conversationId,
            "messageIndex": messageIndex,
            "type": type,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        let endpoint = Endpoint(path: "/api/message-feedback", method: .delete, body: data, requiresAuth: true)
        _ = try? await api.send(endpoint)
    }

    // MARK: - Favorites (save place)

    func savePlace(placeId: String, placeName: String, placeAddress: String, placeType: String) async {
        let body: [String: Any] = [
            "placeId": placeId,
            "placeName": placeName,
            "placeAddress": placeAddress,
            "placeType": placeType,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        let endpoint = Endpoint(path: "/api/favorites", method: .post, body: data, requiresAuth: true)
        _ = try? await api.send(endpoint)
    }

    // MARK: - Preferences (onboarding)

    func fetchPreferences() async -> [String]? {
        let endpoint = Endpoint(path: "/api/preferences", method: .get, requiresAuth: true)
        guard let result = try? await api.send(endpoint, as: PreferencesResponse.self) else { return nil }
        return result.preferences
    }

    func savePreferences(_ preferences: [String]) async {
        let body: [String: Any] = ["preferences": preferences]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        let endpoint = Endpoint(path: "/api/preferences", method: .post, body: data, requiresAuth: true)
        _ = try? await api.send(endpoint)
    }

    // MARK: - Streaming chat with enrichment

    func chatWithContext(messages: [MessagePayload], userPreferences: [String]?, responseStyle: String?,
                        userLocation: [String: Double]? = nil) -> AsyncThrowingStream<StreamFrame, Error> {
        var bodyDict: [String: Any] = [
            "messages": messages.map { ["role": $0.role, "content": $0.content] }
        ]
        if let prefs = userPreferences, !prefs.isEmpty {
            bodyDict["userPreferences"] = prefs
        }
        if let style = responseStyle, !style.isEmpty {
            bodyDict["responseStyle"] = style
        }
        if let loc = userLocation {
            bodyDict["userLocation"] = loc
        }
        guard let bodyData = try? JSONSerialization.data(withJSONObject: bodyDict) else {
            return AsyncThrowingStream { $0.finish(throwing: AppError.validation(message: "Failed to encode chat request")) }
        }
        let endpoint = Endpoint(
            path: "/api/chat",
            method: .post,
            body: bodyData,
            requiresAuth: true,
            timeout: 60
        )
        return streaming.stream(endpoint)
    }
}

private struct MemoryCheckResponse: Decodable {
    let memory: AnyCodable?
}

private struct PreferencesResponse: Decodable {
    let preferences: [String]?
}

private struct AnyCodable: Decodable {
    init(from decoder: Decoder) throws {
        _ = try decoder.singleValueContainer()
    }
}
