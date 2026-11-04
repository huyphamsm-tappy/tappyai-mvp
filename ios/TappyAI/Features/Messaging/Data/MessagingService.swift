import Foundation

/// User ↔ user messaging — the routes under `/api/messaging`, the same the web Inbox's "Tin nhắn" tab and Android call.
///
/// 🚨 NOT `/api/chat` and NOT `/api/conversations` (those are the user ↔ TappyAI assistant). Every call is authenticated; a thread the
/// caller is not in answers 404, never 403 (a privacy decision the server makes — and one this client respects: it never tells "not a
/// participant" from "blocked"). Thread and message ids are written into paths, so only a plain id (`DeepLinkHandler.isSafeId`) is accepted.
struct MessagingService: Sendable {
    private let api: APIClient
    private let consent: AIConsentCoordinator?

    init(api: APIClient, consent: AIConsentCoordinator? = nil) {
        self.api = api
        self.consent = consent
    }

    private func safe(_ id: String) throws -> String {
        guard DeepLinkHandler.isSafeId(id) else { throw AppError.validation(message: "invalid id") }
        return id
    }

    /// `GET /api/messaging/threads` — the caller's conversations, newest activity first, with a server-derived unread count each.
    func threads() async throws -> [ChatThreadSummary] {
        let endpoint = Endpoint(path: "/api/messaging/threads", method: .get, requiresAuth: true)
        return try await api.send(endpoint, as: ChatThreadsResponse.self).threads
    }

    /// `POST /api/messaging/threads` — one person is a direct thread (deduplicated per pair server-side, so an existing conversation is
    /// simply reopened), more is a group. Answers the thread id.
    func start(userIds: [String], title: String? = nil) async throws -> String {
        let ids = try userIds.map(safe)
        guard !ids.isEmpty else { throw AppError.validation(message: "no members") }
        let endpoint = Endpoint(path: "/api/messaging/threads", method: .post,
                                body: try ChatWire.startBody(userIds: ids, title: title), requiresAuth: true)
        return try await api.send(endpoint, as: ChatStartThreadResponse.self).threadId
    }

    /// `GET /api/messaging/threads/{id}/messages` — one page, oldest → newest. `before` AND `beforeId` (the oldest loaded message's stamp
    /// and id) page further back: together they are the keyset (created_at, id), so messages sharing a timestamp are neither skipped nor repeated.
    func messages(threadId: String, before: String? = nil, beforeId: String? = nil) async throws -> ChatMessagesPage {
        var query: [URLQueryItem] = []
        if let before { query.append(URLQueryItem(name: "before", value: before)) }
        if let beforeId { query.append(URLQueryItem(name: "beforeId", value: beforeId)) }
        let endpoint = Endpoint(path: "/api/messaging/threads/\(try safe(threadId))/messages", method: .get, query: query, requiresAuth: true)
        return try await api.send(endpoint, as: ChatMessagesPage.self)
    }

    /// `POST /api/messaging/threads/{id}/messages` — text, a picture, or both. `clientId` makes the send idempotent: a retry of the SAME
    /// attempt returns the stored row instead of a second copy.
    func send(threadId: String, body: String, clientId: String?, media: UploadedPhoto?) async throws -> ChatMessage {
        let endpoint = Endpoint(path: "/api/messaging/threads/\(try safe(threadId))/messages", method: .post,
                                body: try ChatWire.sendBody(body: body, clientId: clientId, media: media), requiresAuth: true)
        return try await api.send(endpoint, as: ChatSendResponse.self).message
    }

    /// `POST /api/messaging/threads/{id}/media` — uploads ONE picture (JPEG, at most 5 MB). The server re-encodes it without metadata, runs a
    /// safety scan and stores it in a private bucket; the answer is the object's path. 422 = not allowed · 503 = scan unavailable ·
    /// 403 `ai_consent_required` = AI data sharing not agreed · 429 = too fast · 404 = no such thread.
    ///
    /// App Review 5.1.2(i): the scan sends the picture to the AI provider, so the person agrees first (and the networking layer refuses the
    /// call while consent is missing — `AIConsentStore.isAIPath`).
    func uploadPhoto(threadId: String, jpeg: Data) async throws -> UploadedPhoto {
        let id = try safe(threadId)
        if let consent, !(await consent.ensure()) { throw AIConsentStore.blockedError }
        let boundary = "tappy-" + UUID().uuidString
        let endpoint = Endpoint(path: "/api/messaging/threads/\(id)/media", method: .post,
                                body: ChatWire.multipartBody(file: jpeg, mimeType: "image/jpeg", boundary: boundary),
                                requiresAuth: true, timeout: 60,
                                contentType: "multipart/form-data; boundary=\(boundary)")
        return try await api.send(endpoint, as: ChatUploadResponse.self).media
    }

    /// `POST /api/messaging/threads/{id}/read` — moves the caller's read cursor to now (the unread count is derived from it, never decremented).
    func markRead(threadId: String) async throws {
        _ = try await api.send(Endpoint(path: "/api/messaging/threads/\(try safe(threadId))/read", method: .post, requiresAuth: true))
    }

    /// `GET /api/messaging/unread` — the two numbers behind the navigation badge.
    func unread() async throws -> ChatUnread {
        try await api.send(Endpoint(path: "/api/messaging/unread", method: .get, requiresAuth: true), as: ChatUnread.self)
    }
}
