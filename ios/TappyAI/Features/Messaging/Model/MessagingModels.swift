import Foundation

// User ↔ user messaging (the web Inbox's "Tin nhắn" tab, `src/lib/messaging/types.ts`). NOT the AI chat: nothing here
// touches `Features/Chat`. The wire shapes are the web's own (camelCase), read leniently — one renamed or missing field
// must never break the whole screen (see `LenientDecoding.swift`).

enum ChatThreadKind: String, Sendable { case direct, group }

struct ChatParticipant: Decodable, Equatable, Hashable, Sendable {
    let userId: String
    let fullName: String?
    let avatarUrl: String?

    private enum CodingKeys: String, CodingKey { case userId, fullName, avatarUrl }

    init(userId: String, fullName: String? = nil, avatarUrl: String? = nil) {
        self.userId = userId; self.fullName = fullName; self.avatarUrl = avatarUrl
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.requiredId(forKey: .userId)
        fullName = c.lenient(String.self, forKey: .fullName)
        avatarUrl = c.lenient(String.self, forKey: .avatarUrl)
    }
}

struct ChatLastMessage: Decodable, Equatable, Hashable, Sendable {
    let body: String
    let senderId: String?
    let createdAt: String

    private enum CodingKeys: String, CodingKey { case body, senderId, createdAt }

    init(body: String, senderId: String? = nil, createdAt: String = "") {
        self.body = body; self.senderId = senderId; self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        body = c.lenient(String.self, forKey: .body, default: "")
        senderId = c.lenient(String.self, forKey: .senderId)
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
    }
}

/// One row of the conversation list. `unreadCount` is DERIVED by the server (`chat_thread_summaries()`): the messages after the
/// caller's read cursor that the caller did not send. Never stored, never computed on the client.
struct ChatThreadSummary: Decodable, Equatable, Hashable, Identifiable, Sendable {
    let id: String
    let kind: ChatThreadKind
    /// A group's name; nil for a direct thread, which is titled from the counterpart.
    let title: String?
    let lastMessageAt: String
    let lastMessage: ChatLastMessage?
    let unreadCount: Int
    /// Everyone in the thread, the caller included.
    let participants: [ChatParticipant]

    private enum CodingKeys: String, CodingKey { case id, kind, title, lastMessageAt, lastMessage, unreadCount, participants }

    init(id: String, kind: ChatThreadKind, title: String? = nil, lastMessageAt: String = "", lastMessage: ChatLastMessage? = nil,
         unreadCount: Int = 0, participants: [ChatParticipant] = []) {
        self.id = id; self.kind = kind; self.title = title; self.lastMessageAt = lastMessageAt
        self.lastMessage = lastMessage; self.unreadCount = unreadCount; self.participants = participants
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        kind = ChatThreadKind(rawValue: c.lenient(String.self, forKey: .kind, default: "direct")) ?? .direct
        title = c.lenient(String.self, forKey: .title)
        lastMessageAt = c.lenient(String.self, forKey: .lastMessageAt, default: "")
        lastMessage = c.lenient(ChatLastMessage.self, forKey: .lastMessage)
        unreadCount = max(0, c.lenientInt(forKey: .unreadCount) ?? 0)
        participants = c.lossyArray(ChatParticipant.self, forKey: .participants)
    }

    /// The other person in a direct thread; nil for a group.
    func counterpart(meId: String?) -> ChatParticipant? {
        kind == .direct ? participants.first { $0.userId != meId } : nil
    }

    /// A group keeps its name; a direct thread takes the counterpart's. `fallback` is the caller's localized string.
    func displayTitle(meId: String?, fallback: String) -> String {
        if kind == .group {
            let t = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? fallback : t
        }
        let n = (counterpart(meId: meId)?.fullName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? fallback : n
    }
}

/// The picture of a message. `url` is a SHORT-LIVED signed link the server made for this read (nil when it could not be made);
/// `expired` is true once the server removed the picture after its retention period (30 days). The message stays either way; a copy
/// saved on this device (`ChatPhotoFiles`) can still show it.
struct ChatMessageMedia: Decodable, Equatable, Hashable, Sendable {
    let url: String?
    let width: Int?
    let height: Int?
    let expired: Bool

    private enum CodingKeys: String, CodingKey { case url, width, height, expired }

    init(url: String?, width: Int? = nil, height: Int? = nil, expired: Bool = false) {
        self.url = url; self.width = width; self.height = height; self.expired = expired
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        url = c.lenient(String.self, forKey: .url)
        width = c.lenientInt(forKey: .width)
        height = c.lenientInt(forKey: .height)
        expired = c.lenient(Bool.self, forKey: .expired, default: false)
    }
}

struct ChatMessage: Decodable, Equatable, Hashable, Identifiable, Sendable {
    let id: String
    let threadId: String
    /// Nil when the author's account is gone — the message stays, the name does not.
    let senderId: String?
    /// Empty ONLY when the message carries a picture.
    let body: String
    let createdAt: String
    let media: ChatMessageMedia?

    private enum CodingKeys: String, CodingKey { case id, threadId, senderId, body, createdAt, media }

    init(id: String, threadId: String = "", senderId: String?, body: String, createdAt: String, media: ChatMessageMedia? = nil) {
        self.id = id; self.threadId = threadId; self.senderId = senderId; self.body = body; self.createdAt = createdAt; self.media = media
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        threadId = c.lenient(String.self, forKey: .threadId, default: "")
        senderId = c.lenient(String.self, forKey: .senderId)
        body = c.lenient(String.self, forKey: .body, default: "")
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
        media = c.lenient(ChatMessageMedia.self, forKey: .media)
    }
}

/// A picture the server accepted: the path the message must carry, and its size as the server measured it.
struct UploadedPhoto: Decodable, Equatable, Hashable, Sendable {
    let path: String
    let width: Int?
    let height: Int?

    private enum CodingKeys: String, CodingKey { case path, width, height }

    init(path: String, width: Int? = nil, height: Int? = nil) { self.path = path; self.width = width; self.height = height }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        path = try c.requiredId(forKey: .path)
        width = c.lenientInt(forKey: .width)
        height = c.lenientInt(forKey: .height)
    }
}

// MARK: - Responses

struct ChatThreadsResponse: Decodable, Sendable {
    let threads: [ChatThreadSummary]
    private enum CodingKeys: String, CodingKey { case threads }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        threads = c.lossyArray(ChatThreadSummary.self, forKey: .threads)
    }
}

/// One page of history, oldest → newest; `hasMore` says there is an older page.
struct ChatMessagesPage: Decodable, Equatable, Sendable {
    let messages: [ChatMessage]
    let hasMore: Bool
    private enum CodingKeys: String, CodingKey { case messages, hasMore }
    init(messages: [ChatMessage], hasMore: Bool) { self.messages = messages; self.hasMore = hasMore }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        messages = c.lossyArray(ChatMessage.self, forKey: .messages)
        hasMore = c.lenient(Bool.self, forKey: .hasMore, default: false)
    }
}

struct ChatSendResponse: Decodable, Sendable {
    let message: ChatMessage
}

struct ChatUploadResponse: Decodable, Sendable {
    let media: UploadedPhoto
}

struct ChatStartThreadResponse: Decodable, Sendable {
    let threadId: String
    private enum CodingKeys: String, CodingKey { case threadId }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        threadId = try c.requiredId(forKey: .threadId)
    }
}

/// `GET /api/messaging/unread`: the unread messages, and how many of the unread notifications are message notifications.
struct ChatUnread: Decodable, Equatable, Sendable {
    let messages: Int
    let messageNotifications: Int

    static let zero = ChatUnread(messages: 0, messageNotifications: 0)

    private enum CodingKeys: String, CodingKey { case messages, messageNotifications }

    init(messages: Int, messageNotifications: Int) {
        self.messages = max(0, messages); self.messageNotifications = max(0, messageNotifications)
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        messages = max(0, c.lenientInt(forKey: .messages) ?? 0)
        messageNotifications = max(0, c.lenientInt(forKey: .messageNotifications) ?? 0)
    }

    /// The one number a badge shows: the other notifications plus the unread messages. A message notification is never counted twice
    /// (the web's `badgeTotal`).
    static func badgeTotal(notificationUnread: Int, unread: ChatUnread) -> Int {
        max(0, notificationUnread - unread.messageNotifications) + unread.messages
    }
}

// MARK: - Limits

enum ChatLimits {
    /// Matches the CHECK constraint on `chat_messages.body`; the database is the authority.
    static let maxBody = 4000
    /// The ceiling of the private bucket (5 MB) — the same number the web and the server enforce.
    static let maxPhotoBytes = 5 * 1024 * 1024
    /// The longest side a re-encoded photo keeps.
    static let maxPhotoSide: CGFloat = 2048
}
