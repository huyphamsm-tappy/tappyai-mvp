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

    /// The request's `messages`: `{role, content}`, plus `experimental_attachments: [{url, contentType, name}]` on a question that
    /// carries a photo or PDF (the web's useChat shape; the server's `validateAttachment` reads it). A question without one has no such key.
    static func wireMessages(_ messages: [MessagePayload]) -> [[String: Any]] {
        messages.map { message in
            var row: [String: Any] = ["role": message.role, "content": message.content]
            if !message.attachments.isEmpty {
                row["experimental_attachments"] = message.attachments.map { $0.wireObject }
            }
            return row
        }
    }

    // MARK: - Conversation CRUD

    /// How many pages of history are read while looking for one conversation (40 rows each): bounded, so a vanished id cannot loop.
    static let maxHistoryPages = 25

    /// The conversation with this id. The list API answers 40 rows at a time, newest first, so a chat older than the newest 40 is on a later
    /// page: the search follows the `before` cursor until it finds the chat or the history ends. (Before, only the first page was read and an
    /// older chat opened as "not found", then continued as a new conversation.)
    func loadConversation(id: String) async throws -> Conversation {
        var before: String?
        for _ in 0..<Self.maxHistoryPages {
            var query: [URLQueryItem] = []
            if let before { query.append(URLQueryItem(name: "before", value: before)) }
            let endpoint = Endpoint(path: "/api/conversations", method: .get, query: query, requiresAuth: true)
            // Lossy: one malformed row must not hide the conversation being opened.
            let page = try await api.send(endpoint, as: ConversationPage.self)
            if let hit = page.conversations.first(where: { $0.id == id }) { return hit }
            guard page.rowCount > 0, let next = ConversationPage.cursor(from: page.lastUpdatedAt), next != before else { break }
            before = next
        }
        throw AppError.validation(message: "Conversation not found")
    }

    /// The stored conversation whose last question is `userText` (newest first, the first page only), or nil. Used to read back a reply the
    /// stream lost: the server stores the whole answer even when the phone's connection dropped.
    func savedConversation(endingWith userText: String) async throws -> Conversation? {
        let wanted = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        let endpoint = Endpoint(path: "/api/conversations", method: .get, requiresAuth: true)
        let page = try await api.send(endpoint, as: ConversationPage.self)
        return page.conversations.first { conversation in
            conversation.messages.last(where: { $0.role == MessageRole.user.rawValue })?
                .content.trimmingCharacters(in: .whitespacesAndNewlines) == wanted
        }
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

    /// Saves the messages. `title` is nil for an ordinary save so the stored title (possibly renamed on the web) is left alone.
    func updateConversation(id: String, title: String? = nil, messages: [MessagePayload]) async throws {
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
        guard let result = try? await api.send(endpoint, as: ChatPreferencesResponse.self) else { return nil }
        return result.preferences
    }

    func savePreferences(_ preferences: [String]) async {
        let body: [String: Any] = ["preferences": preferences]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        let endpoint = Endpoint(path: "/api/preferences", method: .post, body: data, requiresAuth: true)
        _ = try? await api.send(endpoint)
    }

    // MARK: - Streaming chat with enrichment

    /// `guestAgeDeclaration`: the guest's stated age (`18plus` | `YYYY`), sent as
    /// `x-tappy-age-declared`. Nil for accounts — their date of birth is read server-side.
    func chatWithContext(messages: [MessagePayload], userPreferences: [String]?, responseStyle: [String: String]?,
                        userLocation: [String: Double]? = nil,
                        guestAgeDeclaration: String? = nil,
                        chatSessionId: String? = nil,
                        decisionEvidenceId: String? = nil,
                        mode: ChatMode = .default) -> AsyncThrowingStream<StreamFrame, Error> {
        var bodyDict: [String: Any] = [
            "messages": Self.wireMessages(messages)
        ]
        if let prefs = userPreferences, !prefs.isEmpty {
            bodyDict["userPreferences"] = prefs
        }
        // The server reads an OBJECT `{tone, length}` (`route.ts`: a string is ignored). It was sent as a string, and never set, so the
        // style the person chose in "Tappy knows" changed nothing.
        if let style = responseStyle, !style.isEmpty {
            bodyDict["responseStyle"] = style
        }
        if let loc = userLocation {
            bodyDict["userLocation"] = loc
        }
        // R14: one UUID per chat, sent on every turn (first turn and guests included).
        if let sid = chatSessionId, ChatSessionId.isValid(sid) {
            bodyDict["chatSessionId"] = sid
        }
        // ADR-024: the client echoes the KEY the server answered the last shopping turn with; the server looks the
        // frozen listing facts up under the caller's own id. A malformed, expired or foreign key resolves to nothing.
        if let key = decisionEvidenceId, !key.isEmpty {
            bodyDict["decisionEvidenceId"] = key
        }
        // The one-brain server reads the mode from here; without it a request runs as plain Chat.
        bodyDict["mode"] = mode.wire
        guard let bodyData = try? JSONSerialization.data(withJSONObject: bodyDict) else {
            return AsyncThrowingStream { $0.finish(throwing: AppError.validation(message: "Failed to encode chat request")) }
        }
        var headers: [String: String] = [
            ChatClientDeclaration.surfaceHeader: ChatClientDeclaration.surface,
            ChatClientDeclaration.capsHeader: ChatClientDeclaration.caps,
        ]
        if let declared = guestAgeDeclaration, !declared.isEmpty {
            headers[GuestAgeDeclaration.header] = declared
        }
        let endpoint = Endpoint(
            path: "/api/chat",
            method: .post,
            headers: headers,
            body: bodyData,
            requiresAuth: true,
            timeout: mode == .deep ? ChatStreamTimeout.deepResearch : ChatStreamTimeout.standard
        )
        return streaming.stream(endpoint)
    }
}

/// How long the chat stream may stay SILENT before the request times out (`URLRequest.timeoutInterval` counts the time
/// without a byte). 130 s / 320 s as the one-brain web and Android read a silent stream: a Think step, or most of a Deep
/// Research run, is quiet for a long time.
enum ChatStreamTimeout {
    static let standard: TimeInterval = 130
    static let deepResearch: TimeInterval = 320
}

/// What this build declares to `/api/chat`. `x-tappy-surface: ios` tells the server the client
/// draws the place/shopping decision as a card (so the prose must not repeat it) — the server
/// whitelist does not know "ios" yet (docs/ios/IOS-REQUESTS.md #1). `x-tappy-caps: card` = this
/// build draws the decision card (`rendersDecisionCard(surface, caps)` on the server). The ASK block is gone.
enum ChatClientDeclaration {
    static let surfaceHeader = "x-tappy-surface"
    static let surface = "ios"
    static let capsHeader = "x-tappy-caps"
    static let caps = "card"
}

private struct MemoryCheckResponse: Decodable {
    let memory: IgnoredJSONValue?
}

/// `language` is null when the server cannot name a language it supports, and `speakable` mirrors
/// that. Both are read: trusting only one would rely on the two never disagreeing.
private struct VoiceLanguageResponse: Decodable {
    let language: String?
    let speakable: Bool
}

private struct ChatPreferencesResponse: Decodable {
    let preferences: [String]?
}

private struct IgnoredJSONValue: Decodable {
    init(from decoder: Decoder) throws {
        _ = try decoder.singleValueContainer()
    }
}
