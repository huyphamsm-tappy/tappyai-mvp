// ADR-014 Notification API contract v1 — the SINGLE shape returned by
// GET /api/notifications and consumed by every client (Web, Android, iOS).
// There are no platform-specific notification endpoints.

export interface NotificationActor {
  id: string
  name: string
  avatar: string | null
}

export interface NotificationDTO {
  id: string
  type: string          // like|comment|follow|milestone|deal|morning_brief|weekly|travel|lunch|price|broadcast|system
  category: string      // social|deal|explore|system
  title: string
  body: string
  actor: NotificationActor | null
  entity_url: string | null
  image_url: string | null
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface NotificationsResponse {
  notifications: NotificationDTO[]
  unread_count: number
}
