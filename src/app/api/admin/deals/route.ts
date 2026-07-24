// /api/admin/deals — list ALL partner deals + create a deal (admin+).
// Handler contract mirrors the RBAC routes: RBAC -> origin -> rate-limit ->
// validate -> operation -> audit -> uniform envelope.

import { requireAdminRole, adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { listAllDealsForAdmin, mapPartnerDealRow } from '@/lib/deals/partnerDeals'
import { CreateDealSchema, toDbColumns } from '@/lib/deals/schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { user } = await requireAdminRole(req, 'admin')
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
    const { user, role } = await requireAdminRole(req, 'admin')
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
      .select('id, partner_name, category, title, description, official_url, banner_image, logo_image, display_order, is_active, start_at, end_at, country_code, created_at, updated_at')
      .single()

    if (error || !data) {
      console.error('[admin][deals] create failed:', error?.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: role,
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
