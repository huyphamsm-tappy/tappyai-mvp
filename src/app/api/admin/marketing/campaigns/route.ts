import { z } from 'zod'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCampaign, listCampaigns } from '@/lib/marketing/campaignStore'

// GET  /api/admin/marketing/campaigns   list
// POST /api/admin/marketing/campaigns   create a DRAFT
//
// Contract: docs/controller-v2/V2.2_MARKETING_PHASE2_CONTRACT.md
//   M-5   category is structural — the body has no `category` field
//   M-16  a campaign is created in `draft`; activation is a separate act
//   M-21  marketing.campaigns.* is INDEPENDENT of notifications.send.broadcast
//   M-22  the route authorizes; a page that hides a button stops nobody
//   M-28  no coupon, discount or promotion concept
//
// 🚨 NOTHING HERE SENDS ANYTHING. Creating a campaign writes one row. The
// activation path is a different route, behind a different permission, and it
// fails closed while M-30 is UNSATISFIED and Q6 is OPEN.
//
// 🔑 THE PERMISSIONS ARE MARKETING'S OWN. `marketing.campaigns.create` must
// never imply, and never be implied by, `notifications.send.broadcast` (M-21).
// Two authorities over one delivery mechanism is exactly the confusion the
// dispatch seam's zero-authorization design exists to prevent.

export const runtime = 'nodejs'

/**
 * 🚨 THERE IS NO `category` AND NO `status` FIELD, DELIBERATELY.
 *
 * `category` is CHECKed to 'marketing' in the database (M-5) and never accepted
 * from an author: one who could declare a campaign transactional would be
 * exempt from every cap, quiet-hours rule and consent check, because all of
 * them key on category.
 *
 * `status` is absent because a campaign is always created as a draft.
 * Accepting it would be a way to create one already `active` and bypass the
 * dry-run gate entirely.
 */
const CampaignSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  link: z
    .string()
    .trim()
    .max(500)
    .optional()
    // Relative same-site paths only — identical to the Phase C broadcast route.
    // A campaign reaches many people at once, so an absolute URL here is a
    // redirect to anywhere aimed at all of them.
    .refine((v) => v === undefined || v === '' || (v.startsWith('/') && !v.startsWith('//')), {
      message: 'Link must be a relative path beginning with "/"',
    }),
})

const CREATE_LIMIT = 60
const CREATE_WINDOW_MS = 60 * 60 * 1000

export async function GET(req: Request) {
  try {
    await requirePermission(req, PERMISSIONS.MARKETING_CAMPAIGNS_READ)
    const admin = createAdminClient()
    return Response.json({ data: await listCampaigns(admin) })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { user, actor } = await requirePermission(req, PERMISSIONS.MARKETING_CAMPAIGNS_CREATE)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(
      `admin:marketing:campaign:create:${user.id}`,
      CREATE_LIMIT,
      CREATE_WINDOW_MS,
    )
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many campaigns', 429, {
        'Retry-After': String(rl.retryAfter),
      })
    }

    const parsed = CampaignSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }

    const admin = createAdminClient()
    const campaign = await createCampaign(admin, user.id, {
      title: parsed.data.title,
      body: parsed.data.body,
      link: parsed.data.link || null,
    })

    // Creating a campaign is an administrative act even though it sends
    // nothing: it is the first step of something irreversible, and the record
    // is how a later send gets reviewed against who composed it.
    //
    // 🔑 The message TEXT is deliberately absent — an audit trail answers "who
    // did what, when", and reproducing the copy would turn every draft into a
    // second, unmanaged copy of user-facing communication.
    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(actor),
      action: 'marketing.campaign.create',
      targetType: 'marketing_campaign',
      targetId: campaign.id,
      metadata: { status: campaign.status },
      req,
    })

    return Response.json({ data: campaign }, { status: 201 })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
