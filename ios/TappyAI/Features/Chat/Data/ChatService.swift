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

    // MARK: - Read-aloud language

    /// Asks the backend which language a reply is in. Returns a decision only — no audio, no voice
    /// name, no cost — because iOS keeps using its own `AVSpeechSynthesizer`; all it needed from
    /// the server was which language to set.
    ///
    /// Every failure path returns a REFUSAL rather than a guess. A network error says nothing about
    /// what language the text is in, and defaulting to Vietnamese here is exactly the bug this
    /// replaces.
    func messageLanguage(text: String) async -> MessageLanguage {
        guard !text.isEmpty else { return .notSpeakable }
        let body = try? JSONSerialization.data(withJSONObject: ["text": text])
        let endpoint = Endpoint(path: "/api/voice/language", method: .post,
                                body: body, requiresAuth: true)
        guard let result = try? await api.send(endpoint, as: VoiceLanguageResponse.self) else {
            return .failed
        }
        // Both fields must agree before we speak: `speakable` false, a null language, or a code
        // this build has no tag for all mean the same thing — stay quiet.
        guard result.speakable, let tag = VoiceLocale.tag(for: result.language),
              let language = result.language else {
            return .notSpeakable
        }
        return .speakable(language: language, localeTag: tag)
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
                        userLocation: [String: Double]? = nil,
                        decisionEvidenceId: String? = nil) -> AsyncThrowingStream<StreamFrame, Error> {
        var bodyDict: [String: Any] = [
            "messages": messages.map { ["role": $0.role, "content": $0.content] }
        ]
        // ADR-024: the client supplies the KEY; the server supplies the values. Ownership is enforced
        // server-side against auth.uid(), so a malformed / expired / foreign id resolves to nothing —
        // safely — and never lets the client dictate the facts the assistant quotes.
        if let evId = decisionEvidenceId, !evId.isEmpty {
            bodyDict["decisionEvidenceId"] = evId
        }
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

/// `language` is null when the server cannot name a language it supports, and `speakable` mirrors
/// that. Both are read: trusting only one would rely on the two never disagreeing.
private struct VoiceLanguageResponse: Decodable {
    let language: String?
    let speakable: Bool
}

private struct PreferencesResponse: Decodable {
    let preferences: [String]?
}

private struct AnyCodable: Decodable {
    init(from decoder: Decoder) throws {
        _ = try decoder.singleValueContainer()
    }
}
