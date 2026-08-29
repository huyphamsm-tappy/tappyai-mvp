import { z } from 'zod'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchNotification, MAX_RECIPIENTS_PER_DISPATCH } from '@/lib/notifications/dispatchService'

// POST /api/admin/notifications/send — the Controller's targeted manual send.
//
// Handler contract, in the order every other admin write route uses it:
//   RBAC → origin → rate-limit → validate → RE-AUTHORIZE RECIPIENTS → dispatch
//
// 🔑 THIS ROUTE IS THE AUTHORIZATION BOUNDARY, not the page that links to it.
// `requirePermission` runs here on every request, so a direct `curl` is refused
// exactly as a click is. The Controller page's `canSendUser` flag decides only
// what is DRAWN; it has never been a gate and nothing here trusts it.
//
// The Platform Owner reaches this through `Actor.isOwner` inside the guard. No
// email is read anywhere in this file.
//
// It sends `notifications.send.user` ONLY. Broadcast is a different permission
// and a later phase; there is no "all users" path in this handler to reach.

const SendSchema = z.object({
  // Supabase user ids. Bounded here so an oversized body is rejected before any
  // database work, and again inside the seam, which owns the real cap.
  userIds: z.array(z.string().uuid()).min(1).max(MAX_RECIPIENTS_PER_DISPATCH),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  link: z
    .string()
    .trim()
    .max(500)
    .optional()
    // RELATIVE, SAME-SITE PATHS ONLY. A notification is a channel the platform
    // controls into a user's device; letting an operator put `https://anything`
    // in it makes that channel a redirect to wherever they like. `//evil.com` is
    // excluded too — it is protocol-relative and leaves the site.
    .refine((v) => v === undefined || v === '' || (v.startsWith('/') && !v.startsWith('//')), {
      message: 'Link must be a relative path beginning with "/"',
    }),
})

export async function POST(req: Request) {
  try {
    const { user, actor } = await requirePermission(req, PERMISSIONS.NOTIFICATIONS_SEND_USER)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    // Per-actor volume cap, on the shared limiter. Tighter than the read routes'
    // 100/min because each admitted request can touch up to 500 people.
    const rl = await distributedRateLimit(`admin:notifications:send:${user.id}`, 10, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = SendSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { userIds, title, body, link } = parsed.data

    // ── RE-AUTHORIZE EVERY RECIPIENT, SERVER-SIDE ────────────────────────────
    //
    // 🔑 The client supplied these ids. A picker that only ever offers real
    // users proves nothing about what a crafted request contains, so each id is
    // resolved against `profiles` here and anything that does not resolve is
    // refused. Without this the endpoint would accept any uuid a caller invented
    // and mint a notification row for it.
    //
    // Refuse the WHOLE request rather than silently dropping unknown ids: an
    // operator who believes they messaged 20 people must not be told "sent" when
    // 3 of them never existed.
    const supabase = createAdminClient()
    const unique = [...new Set(userIds)]
    const { data: found, error: lookupErr } = await supabase
      .from('profiles')
      .select('id')
      .in('id', unique)

    if (lookupErr) {
      console.error('[admin][notifications] recipient lookup failed:', lookupErr.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    const known = new Set((found ?? []).map((r) => r.id as string))
    const unknown = unique.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      // Count only. Echoing the ids back would confirm which uuids exist, making
      // the endpoint an oracle for probing the user table.
      return adminError('VALIDATION_ERROR', `${unknown.length} recipient(s) could not be resolved`, 422)
    }

    const outcome = await dispatchNotification({
      recipients: unique,
      message: { title, body, ...(link ? { link } : {}) },
      // `system` is the existing contract's category for platform-originated
      // messages; `broadcast` is its type for an operator-composed one. Neither
      // is new — see emit.ts's NotificationType/NotificationCategory.
      type: 'broadcast',
      category: 'system',
      origin: {
        source: 'controller',
        action: 'notification.send',
        actorId: user.id,
        actorEmail: user.email ?? '—',
        actorRole: auditActorRole(actor),
        isPlatformOwner: actor.isOwner,
      },
      req,
    })

    if (!outcome.ok) {
      if (outcome.reason === 'DUPLICATE') {
        return adminError(
          'DUPLICATE_REQUEST',
          'An identical notification was just sent. Wait before sending it again.',
          409,
          { 'Retry-After': String(outcome.retryAfter) }
        )
      }
      if (outcome.reason === 'TOO_MANY_RECIPIENTS') {
        return adminError('VALIDATION_ERROR', `At most ${outcome.limit} recipients per send`, 422)
      }
      return adminError('VALIDATION_ERROR', 'No recipients', 422)
    }

    // The result is reported per the delivery contract: `accepted` means the
    // provider took the message, NOT that a device displayed it. `perRecipient`
    // carries only the outcome counts — no email, no name, no device token.
    return Response.json({
      data: {
        recipients: outcome.recipients,
        accepted: outcome.accepted,
        failed: outcome.failed,
        gone: outcome.gone,
        unreachable: outcome.unreachable,
        errored: outcome.errored,
        perRecipient: outcome.perRecipient,
      },
    })
  } catch (err) {
    // `requirePermission` throws AdminError for 401/403; the shared mapper turns
    // it into the same envelope every other admin route returns.
    return adminErrorResponse(err)
  }
}
