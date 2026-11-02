// POST /api/admin/moderation/appeals — record an appeal that arrived by EMAIL (support@tappyai.com), for a person who cannot sign in
// (a locked account) or who wrote instead of using the app. Behind MODERATION_ADMIN_ENABLED. Same one-appeal-per-decision rule
// as the in-app route (UNIQUE(decision_id)); the appeal is attributed to the decision's subject.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, requireAdminIdentity, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { AppealCreateSchema } from '../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!moderationAdminEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:moderation:appeal-create:${user.id}`, 20, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    const parsed = AppealCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    await requirePermission(req, PERMISSIONS.MODERATION_CONTENT_HIDE)

    const admin = createAdminClient()
    const { data, error } = await admin.from('moderation_decisions').select('id, subject_user_id, outcome').eq('id', parsed.data.decision_id).maybeSingle()
    if (error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    const d = data as { id: string; subject_user_id: string | null; outcome: string } | null
    if (!d || d.outcome === 'no_violation') return adminError('NOT_FOUND', 'Decision not found', 404)
    const ins = await admin.from('moderation_appeals').insert({ decision_id: d.id, appellant_id: d.subject_user_id, source: 'email', message: parsed.data.message })
    if (ins.error) {
      if ((ins.error as { code?: string }).code === '23505') return adminError('CONFLICT', 'This decision has already been appealed', 409)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    writeAuditLog({ actorId: user.id, actorEmail: user.email ?? '—', actorRole: auditActorRole(actor), action: 'moderation.appeal_recorded', targetType: 'moderation_decision', targetId: d.id, metadata: { source: 'email' }, req })
    return Response.json({ data: { decision_id: d.id, status: 'pending' } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
