// /api/admin/takedowns — the register of authority takedown requests (owner 25/11/2026). Behind MODERATION_ADMIN_ENABLED (404 off).
//   GET   ?view=open|recent   open requests by due time (most urgent first) with their clock, or the most recent of any status. Permission: moderation.queue.read.
//   POST  record a request (agency, reference, when it was RECEIVED, urgency, the content) and, with execute:true, carry it out in the same call. Permission: moderation.content.hide
//         (and users.ban for an account, checked in execute.ts).
// Guard order as the rest of the moderation admin: identity → origin → rate limit → permission → work. Reading the register is audited (who asked for what is part of the record).
import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, requireAdminIdentity, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { CreateTakedownSchema } from '@/lib/safety/takedown/schema'
import { createTakedown, listOpenTakedowns, listRecentTakedowns } from '@/lib/safety/takedown/service'
import type { TakedownUrgency } from '@/lib/safety/takedown/clock'
import { alertTakedownRecipients, newRequestAlert } from '@/lib/safety/takedown/notify'
import { runExecute, view } from './execute'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!moderationAdminEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:takedowns:read:${user.id}`, 100, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    await requirePermission(req, PERMISSIONS.MODERATION_QUEUE_READ)
    const v = new URL(req.url).searchParams.get('view') === 'recent' ? 'recent' : 'open'
    const admin = createAdminClient()
    const rows = v === 'open' ? await listOpenTakedowns(admin) : await listRecentTakedowns(admin)
    if (!rows) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    const now = new Date()
    writeAuditLog({ actorId: user.id, actorEmail: user.email ?? '—', actorRole: auditActorRole(actor), action: 'moderation.authority_takedown.read', metadata: { view: v, returned: rows.length }, req })
    return Response.json({ data: rows.map((r) => view(r, now)) })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: Request) {
  if (!moderationAdminEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    const actorRole = auditActorRole(actor)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:takedowns:write:${user.id}`, 30, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    await requirePermission(req, PERMISSIONS.MODERATION_CONTENT_HIDE)
    const parsed = CreateTakedownSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    const { execute, ...input } = parsed.data

    const admin = createAdminClient()
    const created = await createTakedown(admin, { ...input, urgency: input.urgency as TakedownUrgency }, user.id)
    if (!created.ok) {
      if (created.error === 'target_not_found') return adminError('NOT_FOUND', 'The content to take down was not found', 404)
      if (created.error === 'received_in_future') return adminError('VALIDATION_ERROR', 'received_at is in the future', 422)
      if (created.error === 'duplicate_open') return adminError('CONFLICT', 'An open request already exists for this content', 409)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    writeAuditLog({ actorId: user.id, actorEmail: user.email ?? '—', actorRole, action: 'moderation.authority_takedown.record', targetType: created.row.target_type, targetId: created.row.target_id, metadata: { takedown_id: created.row.id, source: created.row.source, urgency: created.row.urgency, due_at: created.row.due_at }, req })
    if (execute) return runExecute(req, admin, created.row.id, user, actorRole, undefined)
    // Recorded but not yet carried out: the people who act on it are told at once (the clock is already running).
    await alertTakedownRecipients(newRequestAlert(created.row.urgency, created.row.due_at))
    return Response.json({ data: view(created.row) }, { status: 201 })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
