// /api/admin/deals — list ALL partner deals + create a deal (admin+).
// Handler contract mirrors the RBAC routes: RBAC -> origin -> rate-limit ->
// validate -> operation -> audit -> uniform envelope.

import { adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { listAllDealsForAdmin, mapPartnerDealRow } from '@/lib/deals/partnerDeals'
import { CreateDealSchema, toDbColumns } from '@/lib/deals/schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requirePermission(req, PERMISSIONS.COMMERCE_DEALS_READ)
    if (!rateLimit(`admin:deals:list:${user.id}`, 100, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }
    const deals = await listAllDealsForAdmin()
    return Response.json({ data: deals })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { user, actor } = await requirePermission(req, PERMISSIONS.COMMERCE_DEALS_CREATE)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:deals:create:${user.id}`, 30, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const parsed = CreateDealSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('partner_deals')
      .insert(toDbColumns(parsed.data))
      .select('id, partner_slug, partner_name, partner_type, category, title, description, official_url, banner_image, logo_image, is_featured, metadata, display_order, is_active, start_at, end_at, country_code, click_count, created_at, updated_at')
      .single()

    if (error || !data) {
      console.error('[admin][deals] create failed:', error?.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      // `actorRole` is the actor's highest ROLE. The Platform Owner reaches this
      // handler by OWNER_BYPASS and may hold no role at all, so the fallback
      // would record a role they do not have. `is_platform_owner` keeps the
      // audit trail truthful without widening the audit schema.
      actorRole: auditActorRole(actor),
      metadata: { is_platform_owner: actor.isOwner },
      action: 'deals.created',
      targetType: 'partner_deal',
      targetId: data.id as string,
      req,
    })

    return Response.json({ data: mapPartnerDealRow(data) }, { status: 201 })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
