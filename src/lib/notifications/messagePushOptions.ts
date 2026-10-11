import { createHash } from 'node:crypto'

// ── Messenger push options — DESIGN HELPER, NOT WIRED INTO ANY SEND PATH (2026-10-10) ──────────────────────────────────────────────────────────────────────────────
// Design: docs/phase8/MESSENGER-NOTIFICATION-COLLAPSE-PROPOSAL.md §7g (D3). Nothing imports this module until the collapse design is approved; it exists so the push design
// is checked against the real `web-push` library now (messagePushOptions.test.ts) instead of being asserted in prose.
//
// What Web Push can and cannot do (RFC 8030 §5.4, and the installed web-push 3.6.7, which THROWS on a bad value):
//   • `Topic` — at most 32 characters of the URL-safe base64 alphabet. A later push with the same Topic REPLACES an earlier one that the push service has not yet delivered
//     (the device was offline). It does nothing about a notification already shown. The first design used `message:<threadId>` (44 chars, contains ':'): web-push rejects it, so
//     that push would FAIL, not merely not collapse.
//   • `TTL` — how long the push service holds an undelivered push. web-push defaults to four weeks; "you have a message" is useless after a day.
//   • `Urgency` — default `normal`; stated explicitly so it is visible.
//   • Replacing a notification already ON SCREEN is the Notification API's `tag` (+ `renotify`), set in the service worker — see messageNotificationTag().
//   • The primary suppression of push volume is the database throttle (should_push), not the transport.
// FCM / APNs collapse keys are intentionally NOT handled here: the Android and iOS clients do not handle the `message` type yet (application phase).

/** A day: a message pointer older than this is noise. */
export const MESSAGE_PUSH_TTL_SECONDS = 24 * 60 * 60

/** Web Push `Topic` for a thread: 32 URL-safe base64 characters derived from the thread id (scope is per push subscription, so the user is not needed). */
export function messagePushTopic(threadId: string): string {
  return createHash('sha256').update(`tappyai:message-topic:${threadId}`).digest('base64url').slice(0, 32)
}

/** Third argument of `webpush.sendNotification` for a message push. */
export function messageWebPushOptions(threadId: string): { topic: string; TTL: number; urgency: 'normal' } {
  return { topic: messagePushTopic(threadId), TTL: MESSAGE_PUSH_TTL_SECONDS, urgency: 'normal' }
}

/** `Notification.tag` for the service worker: replaces the notification already shown for this thread (no length limit, any string). */
export function messageNotificationTag(threadId: string): string {
  return `message:${threadId}`
}
