import { createAdminClient } from '@/lib/supabase/admin'

export type NotificationType = 'LIKE' | 'COMMENT' | 'FOLLOW'
export type NotificationEntityType = 'review' | 'profile'

// Inserts one row into the persisted `notifications` table (Notification
// System MVP). Best-effort by design — mirrors the existing
// sendNotificationToUser() push helper's .catch(() => {}) convention used
// throughout the like/comment/follow routes: a notification-row failure must
// never fail the parent action (a like/comment/follow that "succeeds" for the
// actor but 500s because the recipient's notification couldn't be recorded
// would be a worse bug than the notification just not being recorded).
//
// Uses the ADMIN (service-role) client because the recipient (`userId`) is
// never the same as the currently-authenticated caller (`actorId`) in a real
// notification — an RLS INSERT policy checking `auth.uid() = user_id` can
// never pass for that shape of write. See the "No direct client inserts"
// policy in 20260716_notifications_mvp.sql for why this is the only insert
// path, by design (same reasoning as review_milestones' admin-client insert).
export async function createNotification(row: {
  userId: string    // recipient
  actorId: string   // who performed the action
  type: NotificationType
  entityType: NotificationEntityType
  entityId: string
}): Promise<void> {
  // Never notify yourself. Also enforced by the table's own CHECK constraint
  // (notifications_no_self_notify) — this early return just avoids a round
  // trip for the common case (e.g. liking your own review).
  if (row.userId === row.actorId) return

  try {
    const { error } = await createAdminClient().from('notifications').insert({
      user_id: row.userId,
      actor_id: row.actorId,
      type: row.type,
      entity_type: row.entityType,
      entity_id: row.entityId,
    })
    // 23505 = idx_notifications_unread_dedup already has an unread row for
    // this exact (user, actor, type, entity) — expected dedup, not an error.
    if (error && error.code !== '23505') {
      console.error('[notifications] insert failed:', error.message)
    }
  } catch (e) {
    console.error('[notifications] insert threw:', e instanceof Error ? e.message : e)
  }
}
