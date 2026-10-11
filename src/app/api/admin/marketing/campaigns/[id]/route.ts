import { z } from 'zod'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign, updateDraft } from '@/lib/marketing/campaignStore'
import { isEditable } from '@/lib/marketing/campaignLifecycle'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { logRateLimitRefusal } from '@/lib/security/rateLimitResponse'

// GET   /api/admin/marketing/campaigns/[id]   read one
// PATCH /api/admin/marketing/campaigns/[id]   edit a DRAFT
//
// Contract: M-16 (only a draft may be edited) · M-21 · M-22 · M-5.
//
// 🚨 THERE IS NO DELETE. Doc 34 gives campaigns a retention period, and the
// delivery ledger holds an ON DELETE RESTRICT foreign key to this table (M-27a)
// precisely so a campaign cannot vanish out from under the rows that record
// what it did. Removal is pruning, on a schedule, in the right order — not an
// operator action.

export const runtime = 'nodejs'

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  link: z
    .string()
    .trim()
    .max(500)
    .optional()
    .refine((v) => v === undefined || v === '' || (v.startsWith('/') && !v.startsWith('//')), {
      message: 'Link must be a relative path beginning with "/"',
    }),
})

type Params = { params: Promise<{ id: string }> }

// SEC4 slice 5c: PATCH was the one admin route without the shared limiter. Same numbers as the sibling `create` (60 per hour per admin); GET is read-only and, like the sibling list, unlimited.
const UPDATE_LIMIT = 60
const UPDATE_WINDOW_MS = 60 * 60 * 1000

export async function GET(req: Request, { params }: Params) {
  try {
    await requirePermission(req, PERMISSIONS.MARKETING_CAMPAIGNS_READ)
    const { id } = await params

    const admin = createAdminClient()
    const campaign = await getCampaign(admin, id)
    if (!campaign) return adminError('NOT_FOUND', 'Campaign not found', 404)

    return Response.json({ data: campaign })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { user, actor } = await requirePermission(req, PERMISSIONS.MARKETING_CAMPAIGNS_UPDATE)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    // Admin semantics (C10): FAIL CLOSED — no store configured, or a store that does not answer, refuses the edit. Checked before the body is parsed or the database read.
    const rl = await distributedRateLimit(`admin:marketing:campaign:update:${user.id}`, UPDATE_LIMIT, UPDATE_WINDOW_MS)
    if (!rl.ok) {
      logRateLimitRefusal('admin_campaign_update', { ...rl, scope: 'distributed' })
      return adminError('RATE_LIMITED', 'Too many campaign edits', 429, {
        'Retry-After': String(rl.retryAfter),
        'X-RateLimit-Reason': rl.reason ?? 'limit_exceeded',
      })
    }

    const { id } = await params
    const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }

    const admin = createAdminClient()
    const existing = await getCampaign(admin, id)
    if (!existing) return adminError('NOT_FOUND', 'Campaign not found', 404)

    // The readable refusal. Editing an active campaign would change the message
    // midway through its own send, so some people receive one text and some
    // another under a single campaign id — and the audit record names the
    // campaign rather than quoting the message, so nothing could say which.
    if (!isEditable(existing.status)) {
      return adminError('CONFLICT', 'Only a draft campaign can be edited', 409)
    }

    // 🚨 AND THE RACE-SAFE ONE. Between the read above and this write another
    // request can activate the campaign. `updateDraft` repeats `status =
    // 'draft'` in its WHERE clause, so the losing request updates zero rows and
    // returns null instead of rewriting the text of a campaign that is already
    // sending. The check above is for the human; this is for the race.
    const updated = await updateDraft(admin, id, {
      title: parsed.data.title,
      body: parsed.data.body,
      link: parsed.data.link || null,
    })
    if (!updated) {
      return adminError('CONFLICT', 'Campaign is no longer a draft', 409)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(actor),
      action: 'marketing.campaign.update',
      targetType: 'marketing_campaign',
      targetId: id,
      metadata: { status: updated.status },
      req,
    })

    return Response.json({ data: updated })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
