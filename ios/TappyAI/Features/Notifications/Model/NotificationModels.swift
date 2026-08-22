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

    var isUnread: Bool { readAt == nil }
}

struct NotificationActor: Decodable, Sendable, Hashable {
    let id: String
    let name: String?
    let avatar: String?
}

struct NotificationsResponse: Decodable, Sendable {
    let notifications: [NotificationDTO]
    let unreadCount: Int
}
