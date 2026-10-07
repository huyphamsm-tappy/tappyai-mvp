import { emitNotification } from '@/lib/notifications/emit'

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
}

export type MessageNotificationOutcome =
  | { emitted: false; reason: 'flag_off' | 'self_notification' }
  | { emitted: true; notificationId: string | null }

/**
 * Emit the Inbox notification for a message that has already been stored.
 *
 * Non-throwing by contract, like every other notification producer: a failure
 * here must never fail the send. The message is already in `chat_messages`; the
 * notification is an extra.
 */
export async function emitMessageNotification(
  input: MessageNotificationInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MessageNotificationOutcome> {
  // The flag is checked FIRST, before any work and before any row is read.
  // "Off" must mean nothing happens at all — not "it happens and is discarded".
  if (!messageNotificationsEnabled(env)) return { emitted: false, reason: 'flag_off' }

  // A message to yourself is possible in some products; a notification about it
  // never is.
  if (input.recipientId === input.senderId) return { emitted: false, reason: 'self_notification' }

  const result = await emitNotification({
    userId: input.recipientId,
    type: 'message',
    // 'social' rather than a new category: this is a person acting on another
    // person, which is exactly what the social category already means, and the
    // transactional/marketing split that NotificationCategory governs is
    // unaffected by it.
    category: 'social',
    title: input.senderName,
    // 🚨 A fixed sentence, not the message. See the header. `body` reaches the
    // device push payload verbatim.
    body: MESSAGE_NOTIFICATION_BODY,
    actorId: input.senderId,
    entityUrl: messageThreadDeepLink(input.threadId),
    imageUrl: input.senderAvatarUrl ?? null,
    // Ids only. A client resolves the thread through the authorised API.
    data: { threadId: input.threadId, kind: 'message' },
  })

  return { emitted: true, notificationId: result.id }
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
