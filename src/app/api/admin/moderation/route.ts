// GET /api/admin/moderation — the moderation queue (Module 09).
//
// Contract: 04 §4.4 · 12_RBAC §3 (Moderation Queue — View: moderator+) ·
// ADR-026 (reporter provenance).
//
// Handler contract: RBAC → same-origin → rate-limit → validate → service →
// uniform envelope (21_Coding_Standards §2).
//
// Contains no SQL, no ordering and no projection decision — all of that lives
// in `moderationService`, which is where ADR-026 I-5 is enforced by naming the
// columns rather than by remembering to strip one.
//
// READING THE QUEUE IS AUDITED. A report set is a record of who complained
// about whom; who opened it is part of the record, exactly as C11 audits
// `session.listed` and Module 08 audits `user.notes_listed`.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { listQueue } from '@/lib/admin/moderation/moderationService'
import { QueueQuerySchema } from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.MODERATION_QUEUE_READ)
    const { user } = ctx

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:moderation:list:${user.id}`, 100, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const url = new URL(req.url)
    const parsed = QueueQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    }

    const result = await listQueue(createAdminClient(), parsed.data)
    if (result.status === 'error') return adminError('INTERNAL_ERROR', 'Operation failed', 500)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'moderation.queue_listed',
      targetType: 'moderation_queue',
      targetId: parsed.data.status ?? 'all',
      // A count and the filter. Never the items — the audit log is
      // `audit.log.read`, admin+, a wider population than the queue itself.
      metadata: { returned: result.items.length, status: parsed.data.status ?? null },
      req,
    })

    return Response.json({ data: result.items })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
