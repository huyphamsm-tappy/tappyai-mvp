// /api/admin/deals/[id] — edit / disable / reorder / schedule (PATCH) and
// delete (DELETE) a partner deal (admin+). PATCH is the single entry point for
// every mutation: is_active toggles disable, display_order handles reorder,
// start_at/end_at handle scheduling.

import { requireAdminRole, adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { mapPartnerDealRow } from '@/lib/deals/partnerDeals'
import { UpdateDealSchema, toDbColumns } from '@/lib/deals/schema'

const FULL_COLUMNS =
  'id, partner_slug, partner_name, partner_type, category, title, description, official_url, banner_image, logo_image, is_featured, display_order, is_active, start_at, end_at, country_code, click_count, created_at, updated_at'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, role } = await requireAdminRole(req, 'admin')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:deals:update:${user.id}`, 60, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const parsed = UpdateDealSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('partner_deals')
      .update(toDbColumns(parsed.data))
      .eq('id', params.id)
      .select(FULL_COLUMNS)
      .maybeSingle()

    if (error) {
      console.error('[admin][deals] update failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    if (!data) return adminError('NOT_FOUND', 'Deal not found', 404)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: role,
      action: 'deals.updated',
      targetType: 'partner_deal',
      targetId: params.id,
      beforeState: { fields: Object.keys(parsed.data) },
      req,
    })

    return Response.json({ data: mapPartnerDealRow(data) })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, role } = await requireAdminRole(req, 'admin')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:deals:delete:${user.id}`, 30, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('partner_deals')
      .select('id, partner_name, title')
      .eq('id', params.id)
      .maybeSingle()
    if (!existing) return adminError('NOT_FOUND', 'Deal not found', 404)

    const { error } = await supabase.from('partner_deals').delete().eq('id', params.id)
    if (error) {
      console.error('[admin][deals] delete failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: role,
      action: 'deals.deleted',
      targetType: 'partner_deal',
      targetId: params.id,
      beforeState: { partner_name: existing.partner_name, title: existing.title },
      req,
    })

    return Response.json({ data: { id: params.id } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
