import { createAdminClient } from '@/lib/supabase/admin'

// Mirrors the `notification_type` Postgres enum. LIKE/COMMENT/FOLLOW are the
// only values the current code emits; REPLY/MENTION/SYSTEM are already
// declared in the enum (see 20260716_notifications_mvp.sql) so shipping them
// later needs no migration.
export type NotificationType = 'LIKE' | 'COMMENT' | 'FOLLOW' | 'REPLY' | 'MENTION' | 'SYSTEM'
export type NotificationEntityType = 'review' | 'profile' | 'comment'

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
// policy in the migration for why this is the only insert path, by design.
export async function createNotification(row: {
  userId: string                       // recipient
  actorId?: string | null              // who performed the action (null for SYSTEM)
  type: NotificationType
  entityType?: NotificationEntityType | null
  entityId?: string | null
  actionUrl: string                    // where tapping navigates
  // Optional presentation fields. Leave title/body NULL for LIKE/COMMENT/
  // FOLLOW — the UI composes those from an i18n key + a live actor join so the
  // text is in the READER's language and shows the actor's CURRENT name (see
  // the migration's comment). Set them only for types whose text isn't
  // derivable (SYSTEM announcements, marketing).
  title?: string | null
  body?: string | null
  image?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  // Never notify yourself. Also enforced by the table's own CHECK constraint
  // (notifications_no_self_notify) — this early return just avoids a round
  // trip for the common case (e.g. liking your own review).
  if (row.actorId && row.userId === row.actorId) return

  try {
    const { error } = await createAdminClient().from('notifications').insert({
      user_id: row.userId,
      actor_id: row.actorId ?? null,
      type: row.type,
      entity_type: row.entityType ?? null,
      entity_id: row.entityId ?? null,
      action_url: row.actionUrl,
      title: row.title ?? null,
      body: row.body ?? null,
      image: row.image ?? null,
      metadata: row.metadata ?? {},
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
