import Foundation

/// The unified notifications contract (ADR-014, `docs/architecture/ADR-014-notification-unification.md`).
/// One shape for Web/Android/iOS — see Production Knowledge Base §4/§5. Backed by a single
/// `notifications` table (migration `20260725_notifications_unification.sql`); every producer
/// writes through one server-side function, every client reads this same shape from
/// `GET /api/notifications`.
struct NotificationDTO: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let type: String
    let category: String
    let title: String
    let body: String
    let actor: NotificationActor?
    let entityUrl: String?
    let imageUrl: String?
    let readAt: String?
    let createdAt: String
    /// For a `message` row: how many unread messages collapsed into it (≥ 1, written by the database function — the web release 2026-11-04);
    /// nil for every other row. Never trusted blindly: a recipient may edit their own rows.
    let messageCount: Int?

    var isUnread: Bool { readAt == nil }
}

/// The free-form `data` payload of a notification. Only `count` is read (a collapsed message row's unread messages).
struct NotificationPayload: Decodable, Sendable, Hashable {
    let count: Int?
    private enum CodingKeys: String, CodingKey { case count }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        count = c.lenientInt(forKey: .count)
    }
}

struct NotificationActor: Decodable, Sendable, Hashable {
    let id: String
    let name: String?
    let avatar: String?
}

struct NotificationsResponse: Decodable, Sendable {
    let notifications: [NotificationDTO]
    let unreadCount: Int

    enum CodingKeys: String, CodingKey { case notifications, unreadCount }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        notifications = c.lossyArray(NotificationDTO.self, forKey: .notifications)
        unreadCount = c.lenientInt(forKey: .unreadCount) ?? notifications.filter(\.isUnread).count
    }
}

/// Lenient: a notification needs an id; text fields default to empty, `createdAt` to "".
extension NotificationDTO {
    enum CodingKeys: String, CodingKey {
        case id, type, category, title, body, actor, entityUrl, imageUrl, readAt, createdAt, data
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        type = c.lenient(String.self, forKey: .type, default: "")
        category = c.lenient(String.self, forKey: .category, default: "")
        title = c.lenient(String.self, forKey: .title, default: "")
        body = c.lenient(String.self, forKey: .body, default: "")
        actor = c.lenient(NotificationActor.self, forKey: .actor)
        entityUrl = c.lenient(String.self, forKey: .entityUrl)
        imageUrl = c.lenient(String.self, forKey: .imageUrl)
        readAt = c.lenient(String.self, forKey: .readAt)
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
        // Only a `message` row carries a count, and only an integer ≥ 1 counts.
        let payload = c.lenient(NotificationPayload.self, forKey: .data)
        messageCount = (type == "message" && (payload?.count ?? 0) >= 1) ? payload?.count : nil
    }
}
