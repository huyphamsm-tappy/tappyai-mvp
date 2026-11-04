import { createAdminClient } from '@/lib/supabase/admin'
import { pushStatusFor } from '@/lib/notifications/emit'
import { sendNotificationToUser, type NotificationData, type NotificationPayload, type PushResult, type SendOptions } from '@/lib/notifications/send'
import { messageNotificationTag, messageWebPushOptions } from '@/lib/notifications/messagePushOptions'

// ── Phase 6 — MESSENGER → INBOX ─────────────────────────────────────────────
//
//   User A sends a message
//        ↓  public.chat_messages          (the Messenger. Content lives here.)
//   message notification event
//        ↓  public.notifications          (the Inbox. A pointer, never content.)
//   User B sees it in the Inbox
//        ↓  deep link
//   User B opens the Messenger conversation
//
// 🚨 INBOX ≠ MESSENGER. This is the ONE connection between them, and it is
// one-directional: the Messenger tells the Inbox that something happened. The
// Inbox never reads a message, and nothing here reads the notification store.
//
// 🚨 THE NOTIFICATION CARRIES NO MESSAGE BODY.
// Not truncated, not previewed, not "just the first few words". The body stays
// in public.chat_messages behind its membership policy; what travels is a
// sender name, a thread id and a destination. A preview would put private
// content into a row with a different security model, into a device push, and
// into every log line that push touches.
//
// ⚠️ SHIPPED OFF. `MESSAGE_NOTIFICATIONS_ENABLED` defaults to false and this
// module emits nothing while it is off. The reason is a native contract: the
// `message` notification type is new, and the Android and iOS clients do not
// handle it yet. Phase 4 turns this on only once Web, Android and iOS all
// understand the type. Until then the Messenger's own realtime channel is how
// a user learns a message arrived.

/**
 * The feature flag. Fail-safe by construction: anything other than the exact
 * string `'true'` — unset, empty, `'1'`, `'TRUE'`, a typo — is OFF.
 */
export function messageNotificationsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MESSAGE_NOTIFICATIONS_ENABLED === 'true'
}

/**
 * The canonical deep-link target for a conversation.
 *
 * ONE function, so the destination is deterministic and there is a single place
 * to change it when Phase 4 gives the Messenger its final route. It points at
 * the surface that exists TODAY — the Messages tab of the Inbox page — rather
 * than inventing a route, because the approved V3 navigation is Phase 4's and
 * this task does not change it.
 *
 * 🔑 THE LINK IS NOT A CAPABILITY. It names a thread; it grants nothing.
 * Opening it still goes through /api/messaging, whose reads are scoped by
 * `chat_is_participant` inside the database, so a link forwarded to a stranger
 * shows them an empty conversation and not somebody else's messages.
 */
export function messageThreadDeepLink(threadId: string): string {
  return `/profile/notifications?tab=messages&thread=${encodeURIComponent(threadId)}`
}

export interface MessageNotificationInput {
  /** The person who will receive the notification. */
  recipientId: string
  /** The person who sent the message. Becomes the notification's actor. */
  senderId: string
  /** Display name for the title. Never the message. */
  senderName: string
  senderAvatarUrl?: string | null
  threadId: string
  /**
   * `created_at` of the STORED message — the database's time, read back from the INSERT (DR-4). The collapsed row's date and the "newest message"
   * rule follow it. It is a timestamp, never text of the message.
   */
  messageCreatedAt: string
}

export type MessageNotificationOutcome =
  | { emitted: false; reason: 'flag_off' | 'self_notification' }
  | { emitted: true; notificationId: string | null }

/** What the collapse needs from the outside world. The default is the real database (service role) and the real push sender; tests pass fakes. */
export interface MessageNotificationDeps {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
  /** The degraded path: ONE plain insert (never a push); a duplicate on the unique index is fine. */
  insertDegraded(row: Record<string, unknown>): PromiseLike<{ error: { code?: string; message: string } | null }>
  push(userId: string, payload: NotificationPayload, options?: SendOptions): Promise<PushResult>
  recordPush(notificationId: string, push: PushResult): Promise<void>
}

function realDeps(): MessageNotificationDeps {
  const admin = createAdminClient()
  return {
    rpc: (name, args) => admin.rpc(name, args) as unknown as ReturnType<MessageNotificationDeps['rpc']>,
    insertDegraded: row => admin.from('notifications').insert(row) as unknown as ReturnType<MessageNotificationDeps['insertDegraded']>,
    push: sendNotificationToUser,
    async recordPush(id, push) {
      const status = pushStatusFor(push)
      const { error } = await admin.from('notifications').update({
        push_status: status,
        push_sent_at: status === 'sent' || status === 'failed' ? new Date().toISOString() : null,
        push_attempts: push.attempted === 0 ? 0 : 1,
        push_error: push.firstError ?? null,
      }).eq('id', id)
      if (error) console.error('[messaging] message push status:', error)
    },
  }
}

/**
 * Emit the Inbox notification for a message that has already been stored — COLLAPSED (DR-4, D1–D10 approved 04/11/2026): there is at most one
 * unread "message" notification per (recipient, thread), carrying a count in `data.count`; a new message updates it instead of adding a row.
 *
 * The write is the database function `emit_message_notification` (service role): one transaction takes the (recipient, thread) lock, counts what is
 * unread from the read cursor, and inserts or updates the row; it answers whether a push is due (10-minute window per recipient and thread, state in
 * Postgres). Only then is a push sent, with a Web Push Topic/TTL and a service-worker `tag` so that an earlier one for the thread is replaced.
 * If the function fails twice, ONE plain insert keeps the Inbox pointer (it never pushes; the next emit repairs the count) and the send still succeeds.
 *
 * Non-throwing by contract, like every other notification producer: a failure here must never fail the send. The message is already in
 * `chat_messages`; the notification is an extra.
 */
export async function emitMessageNotification(
  input: MessageNotificationInput,
  env: NodeJS.ProcessEnv = process.env,
  deps?: MessageNotificationDeps,
): Promise<MessageNotificationOutcome> {
  // The flag is checked FIRST, before any work and before any row is read.
  // "Off" must mean nothing happens at all — not "it happens and is discarded".
  if (!messageNotificationsEnabled(env)) return { emitted: false, reason: 'flag_off' }

  // A message to yourself is possible in some products; a notification about it
  // never is.
  if (input.recipientId === input.senderId) return { emitted: false, reason: 'self_notification' }

  const d = deps ?? realDeps()
  const entityUrl = messageThreadDeepLink(input.threadId)
  const args = {
    p_user: input.recipientId,
    p_thread: input.threadId,
    p_message_at: input.messageCreatedAt,
    p_actor: input.senderId,
    p_title: input.senderName,
    // 🚨 A fixed sentence, not the message. See the header. `body` reaches the device push payload verbatim.
    p_body: MESSAGE_NOTIFICATION_BODY,
    p_entity_url: entityUrl,
    p_image_url: input.senderAvatarUrl ?? null,
  }

  let r = await d.rpc('emit_message_notification', args)
  if (r.error) r = await d.rpc('emit_message_notification', args) // F3: one bounded retry
  if (r.error) {
    console.error('[messaging] emit_message_notification failed twice:', r.error.message)
    const ins = await d.insertDegraded({
      user_id: input.recipientId,
      type: 'message',
      category: 'social',
      title: input.senderName,
      body: MESSAGE_NOTIFICATION_BODY,
      actor_id: input.senderId,
      entity_url: entityUrl,
      image_url: input.senderAvatarUrl ?? null,
      // ids and times only; the count is repaired by the next emit
      data: { threadId: input.threadId, kind: 'message', count: 1, firstMessageAt: input.messageCreatedAt, lastMessageAt: input.messageCreatedAt },
      created_at: input.messageCreatedAt,
      push_status: 'skipped',
    })
    if (ins.error && ins.error.code !== '23505') console.error('[messaging] degraded notification insert failed:', ins.error.message)
    return { emitted: true, notificationId: null }
  }

  const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { notification_id?: string; unread_count?: number; should_push?: boolean } | null | undefined
  // No row: the cursor already covers the message, or nothing is unread from anyone else — there is nothing to point at.
  if (!row?.notification_id) return { emitted: true, notificationId: null }

  if (row.should_push) {
    try {
      // ids and a count only (D4: the count is data, never part of the server-side Vietnamese title). `kind: 'message'` is the notification TYPE the
      // clients read from `data`, as it always was for this producer; it is outside the `normal | tappy_identity` sound classification, hence the cast.
      const data = { url: entityUrl, notificationId: row.notification_id, threadId: input.threadId, kind: 'message', count: row.unread_count ?? 1 } as unknown as NotificationData
      const push = await d.push(
        input.recipientId,
        {
          title: input.senderName,
          body: MESSAGE_NOTIFICATION_BODY,
          ...(input.senderAvatarUrl ? { image: input.senderAvatarUrl } : {}),
          tag: messageNotificationTag(input.threadId),
          data,
        },
        { webpush: messageWebPushOptions(input.threadId) },
      )
      await d.recordPush(row.notification_id, push)
    } catch (e) {
      console.error('[messaging] message push threw:', e)
    }
  }

  return { emitted: true, notificationId: row.notification_id }
}

/**
 * The notification body. Deliberately a constant rather than a parameter — a
 * parameter is how a message preview gets passed in "just this once".
 *
 * It is Vietnamese because the notification is composed server-side at send
 * time, where the recipient's language preference is not available, and the
 * product's default locale is vi. Localising it needs the recipient's locale on
 * the emit path, which is a separate change.
 */
export const MESSAGE_NOTIFICATION_BODY = 'Đã gửi cho bạn một tin nhắn'
