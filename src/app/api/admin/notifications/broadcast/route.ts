import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/config/env'
import { buildBroadcastAudience } from '@/lib/notifications/broadcastAudience'
import { planChunks, BROADCAST_CHUNK_SIZE, audienceFingerprint } from '@/lib/notifications/broadcastChunks'
import { runBroadcastCampaign, campaignDeps } from '@/lib/notifications/broadcastCampaign'

// POST /api/admin/notifications/broadcast — the GOVERNED broadcast path.
//
// Contract: docs/controller-v2/V2.2_PHASE_C_BROADCAST_CONTRACT.md
// Owner decisions: O-1 = B · O-2 = A · O-3 = A · O-4 = C · O-5 = A
//
// Handler contract, the same order every admin write route uses:
//   RBAC → origin → feature switch → rate limit → validate → audience → run
//
// 🚨 THIS IS NOT THE LEGACY ROUTE. `/api/notifications/broadcast` still exists,
// still takes `CRON_SECRET`, and is NOT modified by this change (O-4 = C: it is
// retired only after this path is production-ready and verified, and never in
// the same change — see §14.2). Nothing here imports it, calls it, or alters
// its behaviour.
//
// 🔑 THE AUTHORIZATION BOUNDARY IS THIS FILE. `requirePermission` runs on every
// request, so a direct `curl` is refused exactly as a click is. The permission
// is `notifications.send.broadcast` — super_admin only, and deliberately NOT
// implied by `notifications.send.user`.

export const runtime = 'nodejs'
export const maxDuration = 60

const BroadcastSchema = z.object({
  /**
   * Supplied by the caller so a RESUME reuses it. Absent means "a new
   * campaign", and the server mints one.
   *
   * 🔑 This is the idempotency key (C-7). Retrying with the same value skips
   * everyone already notified; retrying without one starts a second campaign,
   * which is why the response always echoes it back.
   */
  campaignId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  link: z
    .string()
    .trim()
    .max(500)
    .optional()
    // Relative, same-site paths only — identical to the targeted send route. A
    // broadcast reaches everyone, so an absolute URL here would be a redirect
    // to anywhere, aimed at the whole platform at once.
    .refine((v) => v === undefined || v === '' || (v.startsWith('/') && !v.startsWith('//')), {
      message: 'Link must be a relative path beginning with "/"',
    }),
  /**
   * Resolve the audience, write the audit record, send NOTHING.
   *
   * Defaults to TRUE. A missing or malformed flag must not send a broadcast to
   * the entire platform — the safe reading of an ambiguous request is the one
   * that cannot be un-done.
   */
  dryRun: z.boolean().optional().default(true),
})

/**
 * Campaign-level limits.
 *
 * 🚨 COUNTED PER CAMPAIGN, NOT PER DISPATCH (C-11a). A chunked campaign is N
 * dispatches through the seam; a per-dispatch limit would throttle a large
 * audience into failure while a small one passed — punishing reach rather than
 * frequency, which is the opposite of the intent.
 */
const CAMPAIGN_LIMIT = 3
const CAMPAIGN_WINDOW_MS = 24 * 60 * 60 * 1000
/** Dry runs send nothing, so they are limited only against abuse of the read. */
const DRY_RUN_LIMIT = 30
const DRY_RUN_WINDOW_MS = 60 * 60 * 1000

export async function POST(req: Request) {
  try {
    const { user, actor } = await requirePermission(req, PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const parsed = BroadcastSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { title, body, link, dryRun } = parsed.data
    const campaignId = parsed.data.campaignId ?? randomUUID()

    // ── FEATURE SWITCH / KILL SWITCH (C-26, C-13) ────────────────────────────
    // A dry run is always permitted: it sends nothing, and being able to verify
    // the audience on production WITHOUT enabling sends is the entire point of
    // shipping this inert.
    if (!dryRun && !serverEnv.broadcastEnabled()) {
      return adminError('FORBIDDEN', 'Broadcast sending is disabled', 403)
    }

    // ── RATE LIMIT, BEFORE THE FIRST CHUNK (C-11a) ───────────────────────────
    // Refused here, before any audience work and before anything is sent. A
    // limiter that stopped a campaign halfway would leave part of the platform
    // notified and part not — the worst of both outcomes.
    const rl = dryRun
      ? await distributedRateLimit(`admin:broadcast:dryrun:${user.id}`, DRY_RUN_LIMIT, DRY_RUN_WINDOW_MS)
      : await distributedRateLimit(`admin:broadcast:campaign:${user.id}`, CAMPAIGN_LIMIT, CAMPAIGN_WINDOW_MS)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many broadcasts', 429, {
        'Retry-After': String(rl.retryAfter),
      })
    }

    const admin = createAdminClient()
    const audience = await buildBroadcastAudience(admin)
    const chunks = planChunks(audience.recipients, BROADCAST_CHUNK_SIZE)

    // A fingerprint of the ORDERED audience. Two runs reporting the same value
    // resolved the same people in the same order — determinism, proved without
    // any id leaving the server (C-24, C-25).
    const fingerprint = audienceFingerprint(audience.recipients)

    const origin = {
      source: 'controller' as const,
      action: dryRun ? 'notification.broadcast.dry_run' : 'notification.broadcast',
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(actor),
      isPlatformOwner: actor.isOwner,
    }

    const plan = {
      campaignId,
      audienceSize: audience.recipients.length,
      candidates: audience.candidates,
      excluded: audience.excluded,
      chunkCount: chunks.length,
      chunkSizes: chunks.map((c) => c.length),
      audienceFingerprint: fingerprint,
    }

    if (dryRun) {
      // AUDIT EVEN A DRY RUN (C-12). Resolving the whole platform's audience is
      // itself an administrative act, and the record is how the first real send
      // gets reviewed before it exists.
      //
      // 🔑 COUNTS AND A HASH — no user id, no email, no endpoint, no p256dh, no
      // auth key, no message text.
      writeAuditLog({
        actorId: origin.actorId,
        actorEmail: origin.actorEmail,
        actorRole: origin.actorRole,
        action: origin.action,
        targetType: 'notification_broadcast',
        metadata: {
          campaign_id: campaignId,
          dry_run: true,
          audience_size: plan.audienceSize,
          candidates: plan.candidates,
          excluded_banned: audience.excluded.banned,
          excluded_suspended: audience.excluded.suspended,
          excluded_no_profile: audience.excluded.noProfile,
          chunk_count: plan.chunkCount,
          audience_fingerprint: fingerprint,
        },
        req,
      })
      return Response.json({ data: { ...plan, dryRun: true, sent: false } })
    }

    const result = await runBroadcastCampaign({
      campaignId,
      audience: audience.recipients,
      message: { title, body, ...(link ? { link } : {}) },
      origin,
      req,
      // Re-read at every chunk boundary, so clearing the variable halts an
      // in-flight campaign without a deploy.
      shouldContinue: () => serverEnv.broadcastEnabled(),
      deps: campaignDeps(admin),
    })

    // ONE AUDIT RECORD PER CAMPAIGN (C-15), alongside the per-chunk records the
    // seam writes for each dispatch. Carries campaign identity, actor, audience
    // size, chunk count, per-chunk status and the final status — and no
    // recipient identity at all (C-16).
    writeAuditLog({
      actorId: origin.actorId,
      actorEmail: origin.actorEmail,
      actorRole: origin.actorRole,
      action: origin.action,
      targetType: 'notification_broadcast',
      metadata: {
        campaign_id: campaignId,
        dry_run: false,
        audience_size: result.audienceSize,
        already_notified: result.alreadyNotified,
        attempted: result.attempted,
        chunk_count: result.chunkCount,
        chunk_status: result.chunks.map((c) => c.status),
        accepted: result.accepted,
        failed: result.failed,
        gone: result.gone,
        unreachable: result.unreachable,
        errored: result.errored,
        status: result.status,
        audience_fingerprint: fingerprint,
      },
      req,
    })

    // `accepted` means the push service took the message — NOT that a device
    // displayed it. The word "delivered" does not appear, deliberately.
    return Response.json({
      data: {
        ...result,
        candidates: audience.candidates,
        excluded: audience.excluded,
        audienceFingerprint: fingerprint,
        dryRun: false,
      },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
