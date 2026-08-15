// ── What kind of notification this is ────────────────────────────────────────
//
// Carried inside the existing `data` object rather than a new column, so nothing needs a migration
// and every notification already in flight keeps working. A payload without a kind is `normal` —
// that default is the backward-compatibility guarantee, not a fallback for bad input.
//
// WHY A CLASSIFICATION AND NOT A FLAG ON EVERY PUSH: the identity sound is meant to be
// recognisable, and a sound that plays for everything is just a notification sound. The BACKEND
// decides which notifications earn it; clients only read the decision. A client cannot promote its
// own notification to `tappy_identity`, and `tappy_identity` is a classification — never an
// instruction to synthesize text.

export const NOTIFICATION_KINDS = ['normal', 'tappy_identity'] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const DEFAULT_NOTIFICATION_KIND: NotificationKind = 'normal'

/**
 * Reads the kind out of a push payload's `data`, tolerating everything the wire can produce.
 *
 * Anything unrecognised degrades to `normal` rather than throwing: a notification arriving with a
 * kind this build has never heard of should still be shown, silently and normally. Refusing it
 * would mean a future backend release could stop older clients from displaying notifications at all.
 */
export function notificationKindFrom(data: unknown): NotificationKind {
  if (typeof data !== 'object' || data === null) return DEFAULT_NOTIFICATION_KIND
  const kind = (data as { kind?: unknown }).kind
  return typeof kind === 'string' && (NOTIFICATION_KINDS as readonly string[]).includes(kind)
    ? (kind as NotificationKind)
    : DEFAULT_NOTIFICATION_KIND
}

/** True when this notification should play Tappy's identity sound. */
export function wantsTappyIdentity(data: unknown): boolean {
  return notificationKindFrom(data) === 'tappy_identity'
}
