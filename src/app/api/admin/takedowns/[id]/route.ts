// POST /api/admin/takedowns/[id] — close one request: execute (carry the takedown out), reject (not carried out, a reason is required) or needs_info (the request stays open, the clock keeps running).
// Behind MODERATION_ADMIN_ENABLED (404 off). Permission: moderation.content.hide (users.ban as well for an account, in execute.ts).
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, requireAdminIdentity, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { ActionTakedownSchema, isUuid } from '@/lib/safety/takedown/schema'
import { rejectOrAskInfo } from '@/lib/safety/takedown/service'
import { runExecute, view } from '../execute'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!moderationAdminEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    const actorRole = auditActorRole(actor)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:takedowns:write:${user.id}`, 30, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'Invalid request id', 422)
    const parsed = ActionTakedownSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    await requirePermission(req, PERMISSIONS.MODERATION_CONTENT_HIDE)
    const admin = createAdminClient()

    if (parsed.data.action === 'execute') return runExecute(req, admin, params.id, user, actorRole, parsed.data.notes)

    const r = await rejectOrAskInfo(admin, params.id, user.id, parsed.data.action, parsed.data.notes)
    if (!r.ok) {
      if (r.error === 'already_closed') return adminError('CONFLICT', 'This request is already closed', 409)
      if (r.error === 'not_found') return adminError('NOT_FOUND', 'Takedown request not found', 404)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    writeAuditLog({ actorId: user.id, actorEmail: user.email ?? '—', actorRole, action: `moderation.authority_takedown.${parsed.data.action}`, targetType: r.row.target_type, targetId: r.row.target_id, metadata: { takedown_id: r.row.id }, req })
    return Response.json({ data: view(r.row) })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
