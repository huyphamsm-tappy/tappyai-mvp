import { createHash } from 'node:crypto'
import { emitNotification, type NotificationCategory, type NotificationType } from './emit'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { writeAuditLog, type AuditActorRole } from '@/lib/admin/audit'

// ─── THE SHARED NOTIFICATION DISPATCH SEAM ───────────────────────────────────
//
// ONE path from any Controller-side caller to a person's device:
//
//   Controller /admin/notifications ─┐
//                                    ├─► dispatchNotification() ─► emitNotification() ─► Web Push / FCM
//   Marketing campaign activation ───┘        (this file)              (the ONE writer)
//
// 🔑 WHY A SEAM RATHER THAN TWO CALLERS OF `emitNotification`. Fan-out, volume
// capping, duplicate suppression, audit and honest result aggregation are the
// same problem for both callers. Written twice they WILL diverge, and the half
// that diverges silently is the audit — the existing `/api/notifications/broadcast`
// already demonstrates the failure mode: it fans out inline and writes no audit
// record at all.
//
// WHAT THIS SEAM DOES NOT DO — and must never start doing:
//   · no INSERT into `notifications` (emitNotification is the ONE writer, ADR-014)
//   · no FCM call, no Web Push call (send.ts owns the transports)
//   · no CRON_SECRET (that is the machine path; this is the human path)
//   · NO AUTHORIZATION. It receives recipient ids the caller has ALREADY
//     authorized, and it never inspects a permission.
//
// 🔑 THE LAST ONE IS WHY THE TWO PERMISSIONS STAY INDEPENDENT. Because the seam
// checks nothing, `notifications.send.user` and `marketing.campaigns.activate`
// have no shared gate to leak through: neither can ever imply the other. Each
// caller authorizes in its own route, before it gets here.

/** Who is dispatching, and under what action. Supplied by the caller. */
export interface NotificationOrigin {
  /**
   * Closed union on purpose: a third caller should be a deliberate edit here,
   * with a look at whether it belongs on this path at all.
   */
  source: 'controller' | 'marketing'
  /** e.g. 'notification.send' (Controller) or 'campaign.activate' (Marketing). */
  action: string
  actorId: string
  /**
   * `actorEmail` and `actorRole` are here because `writeAuditLog` requires them
   * — `audit_log` records the acting principal for every administrative action,
   * and has since ADR-007. This is the ACTOR (an administrator), never a
   * recipient. Recipient identity is not written to the audit log at all.
   */
  actorEmail: string
  actorRole: AuditActorRole
  isPlatformOwner: boolean
}

/** What happened for ONE recipient. */
export interface RecipientOutcome {
  userId: string
  notificationId: string | null
  /**
   * The provider ACCEPTED this many pushes. Deliberately not called "delivered":
   * neither Web Push nor FCM confirms that a device displayed anything.
   */
  accepted: number
  failed: number
  /** Subscriptions the provider reported permanently dead. Already pruned by send.ts. */
  gone: number
  /** Had at least one enabled subscription. False ⇒ in-app only, no device to push to. */
  reachable: boolean
}

export interface DispatchResult {
  /** Distinct recipients actually dispatched to, after de-duplication. */
  recipients: number
  accepted: number
  failed: number
  gone: number
  /** Recipients with no enabled subscription: the in-app row exists, no push was possible. */
  unreachable: number
  /** Rows that could not be created at all. */
  errored: number
  perRecipient: RecipientOutcome[]
}

export type DispatchRefusal =
  | { ok: false; reason: 'NO_RECIPIENTS' }
  | { ok: false; reason: 'TOO_MANY_RECIPIENTS'; limit: number }
  | { ok: false; reason: 'DUPLICATE'; retryAfter: number }

export type DispatchOutcome = ({ ok: true } & DispatchResult) | DispatchRefusal

export interface DispatchRequest {
  /** Already authorized by the caller. Duplicates are removed here. */
  recipients: readonly string[]
  message: { title: string; body: string; link?: string }
  type: NotificationType
  category: NotificationCategory
  origin: NotificationOrigin
  /** Forwarded to the audit writer for ip/user-agent. Never used for authorization. */
  req?: Request
}

/**
 * The most recipients one dispatch may touch.
 *
 * A cap the SEAM owns, so neither caller can exceed it — a Controller operator
 * pasting a huge list and a Marketing segment that resolves larger than expected
 * are the same risk, and a per-caller cap would have to be remembered twice.
 */
export const MAX_RECIPIENTS_PER_DISPATCH = 500

/**
 * How long an identical dispatch is suppressed.
 *
 * ⚠️ HONEST SCOPE — READ BEFORE RELYING ON THIS. This is duplicate-content
 * SUPPRESSION over a short window, not a durable idempotency ledger. It stops
 * the realistic accident (a double submit, a retried request, an impatient
 * second click) and nothing more. It does NOT survive the window, does not
 * deduplicate across differing content, and returns no prior result — a
 * suppressed call is refused, not replayed. A real idempotency ledger needs
 * durable per-key storage, which would mean a migration, which Phase B does not
 * have.
 */
export const DUPLICATE_WINDOW_MS = 60_000

/**
 * The suppression key: WHO is sending WHAT to WHOM.
 *
 * Hashed so the shared store never holds message text or user ids — the store is
 * external infrastructure and keys are the part of it most likely to be read by
 * a human debugging something.
 */
export function dispatchFingerprint(req: DispatchRequest, recipients: readonly string[]): string {
  const material = JSON.stringify([
    req.origin.source,
    req.origin.action,
    req.origin.actorId,
    req.message.title,
    req.message.body,
    req.message.link ?? '',
    [...recipients].sort(),
  ])
  return createHash('sha256').update(material).digest('hex').slice(0, 32)
}

/**
 * Dispatch one notification to many already-authorized recipients.
 *
 * Never throws: a notification must not break the action that triggered it. A
 * recipient whose row could not be created is counted in `errored` and the rest
 * still go out.
 */
export async function dispatchNotification(req: DispatchRequest): Promise<DispatchOutcome> {
  // De-duplicate FIRST. The same id twice would otherwise mean two rows and two
  // pushes for one person, and would inflate every count below.
  const recipients = [...new Set(req.recipients.filter((id) => typeof id === 'string' && id.length > 0))]

  if (recipients.length === 0) return { ok: false, reason: 'NO_RECIPIENTS' }
  if (recipients.length > MAX_RECIPIENTS_PER_DISPATCH) {
    return { ok: false, reason: 'TOO_MANY_RECIPIENTS', limit: MAX_RECIPIENTS_PER_DISPATCH }
  }

  // Duplicate suppression, on the SHARED store so it holds across instances.
  //
  // ⚠️ `distributedRateLimit` is FAIL-CLOSED by the C10 contract: with no store
  // configured it refuses. That is inherited deliberately — every admin write
  // route in this codebase already behaves this way, and the alternative is a
  // send path whose duplicate guard silently disappears in exactly the
  // deployment where nobody notices.
  const fingerprint = dispatchFingerprint(req, recipients)
  const dedupe = await distributedRateLimit(`notif:dispatch:${fingerprint}`, 1, DUPLICATE_WINDOW_MS)
  if (!dedupe.ok) return { ok: false, reason: 'DUPLICATE', retryAfter: dedupe.retryAfter }

  const settled = await Promise.allSettled(
    recipients.map((userId) =>
      emitNotification({
        userId,
        type: req.type,
        category: req.category,
        title: req.message.title,
        body: req.message.body,
        entityUrl: req.message.link ?? null,
      })
    )
  )

  const perRecipient: RecipientOutcome[] = settled.map((r, i) => {
    const userId = recipients[i]
    if (r.status !== 'fulfilled') {
      return { userId, notificationId: null, accepted: 0, failed: 0, gone: 0, reachable: false }
    }
    const { id, push } = r.value
    return {
      userId,
      notificationId: id,
      accepted: push.sent,
      failed: push.failed,
      gone: push.gone,
      // attempted === 0 means send.ts found no enabled subscription at all.
      reachable: push.attempted > 0,
    }
  })

  const result: DispatchResult = {
    recipients: recipients.length,
    accepted: perRecipient.reduce((n, r) => n + r.accepted, 0),
    failed: perRecipient.reduce((n, r) => n + r.failed, 0),
    gone: perRecipient.reduce((n, r) => n + r.gone, 0),
    unreachable: perRecipient.filter((r) => !r.reachable && r.notificationId !== null).length,
    errored: perRecipient.filter((r) => r.notificationId === null).length,
    perRecipient,
  }

  // AUDIT — written by the SEAM, not the caller, so no caller can forget. The
  // caller only names its source and action.
  //
  // 🔑 WHAT IS DELIBERATELY ABSENT: the message title, the message body, the
  // link, recipient ids, recipient emails, device tokens and provider response
  // bodies. An audit trail exists to answer "who did what, when, and how much of
  // it" — reproducing the message content would turn every send into a second,
  // unmanaged copy of user-facing communication.
  writeAuditLog({
    actorId: req.origin.actorId,
    actorEmail: req.origin.actorEmail,
    actorRole: req.origin.actorRole,
    action: req.origin.action,
    targetType: 'notification_dispatch',
    metadata: {
      source: req.origin.source,
      is_platform_owner: req.origin.isPlatformOwner,
      recipients: result.recipients,
      accepted: result.accepted,
      failed: result.failed,
      gone: result.gone,
      unreachable: result.unreachable,
      errored: result.errored,
    },
    req: req.req,
  })

  return { ok: true, ...result }
}
