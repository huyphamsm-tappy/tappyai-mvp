import { z } from 'zod'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign, markActive, markCompleted } from '@/lib/marketing/campaignStore'
import { isActivatable } from '@/lib/marketing/campaignLifecycle'
import { planCampaign, runCampaign, runnerDeps } from '@/lib/marketing/campaignRunner'
import {
  canActivateSend,
  activationBlockMessage,
  CONFIRM_PHRASE,
} from '@/lib/marketing/activationGate'

// POST /api/admin/marketing/campaigns/[id]/activate
//
// Contract: M-18 (dry run first, then a typed confirmation) · M-12a/c/d (the
// floor, server-side, with no number in the refusal) · M-21/M-22 · M-30 + Q6.
//
// 🚨 THIS ROUTE CANNOT SEND TODAY, AND THAT IS NOT A BUG.
// `canActivateSend()` is FALSE because `CONSENT_EXPORT_SATISFIED` is a source
// constant set to false: M-30 is unsatisfied and Q6 is open. A real send is
// refused here, and refused again inside `runCampaign` — the route's check is
// the readable error, the runner's is the one that holds if a future caller
// forgets. It ships inert on purpose, exactly as Phase C's broadcast path did,
// so the whole path can be reviewed and verified on production BEFORE anything
// is capable of reaching a person.
//
// THE ORDER, and it is the same one every admin write route uses:
//   RBAC -> origin -> parse -> lifecycle -> activation gate -> rate limit ->
//   audience+floor -> confirmation -> run
//
// 🔑 THE CONFIRMATION PHRASE IS NOT TRANSLATED. `CONFIRM_PHRASE` is the same
// literal in every locale, for the same reason C-14 made it so: a phrase that
// changed with the interface language would be a different guard per language.

export const runtime = 'nodejs'
export const maxDuration = 60

// 🚨 `CONFIRM_PHRASE` IS IMPORTED, NOT DECLARED HERE. Next.js validates a route
// module's export surface and rejects anything that is not a recognised route
// field, so `export const CONFIRM_PHRASE` in this file fails the production
// build — and CI does not run `npm run build`, so it would fail first in
// Vercel. It lives in `activationGate.ts` beside the gate it belongs to, which
// also gives the server and the UI one definition instead of two literals.

const ActivateSchema = z.object({
  /**
   * `dryRun` DEFAULTS TO TRUE. A missing or malformed flag must not send a
   * campaign to everyone who consented — the safe reading of an ambiguous
   * request is the one that cannot be undone.
   */
  dryRun: z.boolean().optional().default(true),
  /**
   * Required only for a real send, and checked below rather than in the schema
   * so the refusal can say which requirement failed.
   */
  confirm: z.string().optional(),
})

const ACTIVATE_LIMIT = 3
const ACTIVATE_WINDOW_MS = 24 * 60 * 60 * 1000
const DRY_RUN_LIMIT = 30
const DRY_RUN_WINDOW_MS = 60 * 60 * 1000

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  try {
    const { user, actor } = await requirePermission(req, PERMISSIONS.MARKETING_CAMPAIGNS_ACTIVATE)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const { id } = await params
    const parsed = ActivateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { dryRun, confirm } = parsed.data

    const admin = createAdminClient()
    const campaign = await getCampaign(admin, id)
    if (!campaign) return adminError('NOT_FOUND', 'Campaign not found', 404)

    // Lifecycle first: a completed campaign cannot be re-activated (M-16), and
    // saying so before resolving an audience avoids a pointless read of the
    // whole subscriber table.
    if (!isActivatable(campaign.status)) {
      return adminError('CONFLICT', 'Only a draft campaign can be activated', 409)
    }

    // ── THE ACTIVATION GATE (M-30, Q6) ───────────────────────────────────────
    // A DRY RUN IS STILL PERMITTED while this is closed: it sends nothing, and
    // being able to verify the audience and the governance counts on production
    // WITHOUT any capability to send is the entire point of shipping inert.
    if (!dryRun) {
      const gate = canActivateSend()
      if (!gate.ok) return adminError('FORBIDDEN', activationBlockMessage(gate.reason), 403)
    }

    const rl = dryRun
      ? await distributedRateLimit(`admin:marketing:dryrun:${user.id}`, DRY_RUN_LIMIT, DRY_RUN_WINDOW_MS)
      : await distributedRateLimit(`admin:marketing:activate:${user.id}`, ACTIVATE_LIMIT, ACTIVATE_WINDOW_MS)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many activations', 429, {
        'Retry-After': String(rl.retryAfter),
      })
    }

    const deps = runnerDeps()
    const origin = {
      source: 'marketing' as const,
      action: dryRun ? 'marketing.campaign.dry_run' : 'campaign.activate',
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(actor),
      isPlatformOwner: actor.isOwner,
    }

    if (dryRun) {
      const outcome = await planCampaign(admin, id, deps)
      if (!outcome.ok) {
        // 🚨 NO NUMBER (M-12c). Not the audience size, not the shortfall, not
        // the candidate count. An operator able to read the shortfall back
        // could binary-search a predicate down to one identifiable person.
        return adminError('FORBIDDEN', 'Audience does not meet the minimum size', 403)
      }

      // Audit even a dry run: resolving the whole consenting audience is itself
      // an administrative act, and the record is how a first real send gets
      // reviewed before it exists. Counts and a hash only — no user id, no
      // endpoint, no message text.
      writeAuditLog({
        actorId: origin.actorId,
        actorEmail: origin.actorEmail,
        actorRole: origin.actorRole,
        action: origin.action,
        targetType: 'marketing_campaign',
        targetId: id,
        metadata: {
          dry_run: true,
          audience_size: outcome.plan.audienceSize,
          candidates: outcome.plan.candidates,
          skipped: outcome.plan.skipped,
          chunk_count: outcome.plan.chunkCount,
          audience_fingerprint: outcome.plan.audienceFingerprint,
        },
        req,
      })

      return Response.json({ data: { ...outcome.plan, dryRun: true, sent: false } })
    }

    // ── REAL SEND ────────────────────────────────────────────────────────────
    // The typed phrase is checked AFTER the gate and the lifecycle, so an
    // operator who types it correctly against a blocked campaign is told the
    // real reason rather than being sent to fix their typing.
    if (confirm !== CONFIRM_PHRASE) {
      return adminError('VALIDATION_ERROR', 'Confirmation phrase does not match', 422)
    }

    // Move to `active` FIRST, conditionally on it still being a draft. Two
    // concurrent activations would otherwise both proceed and the audience
    // would be messaged twice; the loser updates zero rows and is refused here.
    const active = await markActive(admin, id, user.id)
    if (!active) return adminError('CONFLICT', 'Campaign is no longer a draft', 409)

    const outcome = await runCampaign(admin, active, origin, deps, req)
    if (!outcome.ok) {
      const message =
        outcome.reason === 'BELOW_MINIMUM_AUDIENCE'
          ? 'Audience does not meet the minimum size'
          : activationBlockMessage(outcome.reason)
      // The campaign is left `active` rather than being silently reverted to
      // draft: it WAS activated, the attempt happened, and the audit record
      // below says what came of it. Rewinding the status would erase that.
      return adminError('FORBIDDEN', message, 403)
    }

    if (outcome.result.status === 'completed') await markCompleted(admin, id)

    writeAuditLog({
      actorId: origin.actorId,
      actorEmail: origin.actorEmail,
      actorRole: origin.actorRole,
      action: origin.action,
      targetType: 'marketing_campaign',
      targetId: id,
      metadata: {
        dry_run: false,
        audience_size: outcome.result.audienceSize,
        already_notified: outcome.result.alreadyNotified,
        attempted: outcome.result.attempted,
        skipped: outcome.result.skipped,
        chunk_count: outcome.result.chunkCount,
        accepted: outcome.result.accepted,
        failed: outcome.result.failed,
        gone: outcome.result.gone,
        unreachable: outcome.result.unreachable,
        errored: outcome.result.errored,
        status: outcome.result.status,
        audience_fingerprint: outcome.result.audienceFingerprint,
      },
      req,
    })

    // `accepted` means the push service took the message — NOT that a device
    // displayed it. The word "delivered" does not appear, deliberately.
    return Response.json({ data: { ...outcome.result, dryRun: false } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
