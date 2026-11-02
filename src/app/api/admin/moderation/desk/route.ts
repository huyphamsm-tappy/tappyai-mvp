// GET /api/admin/moderation/desk?view=queue|appeals|stats — the moderation desk's data (owner 01/10). Behind MODERATION_ADMIN_ENABLED.
//
// Same guard order as the existing queue route: identity → origin → rate limit → permission → read. READING IS AUDITED (a report set is
// a record of who complained about whom; who opened it is part of the record). What a reviewer sees: the queue by priority then age,
// the reported content with its nearest context, the subject's active strikes, how often the reporter's reports are rejected, how many
// reports exist on the same target (information, NEVER a verdict). What nobody sees here: who the reporter is.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, requireAdminIdentity, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { activeStrikes, isOverdue, reporterTrust, resolveTarget, type ActiveStrike } from '@/lib/safety/moderationDecisions'
import { DeskQuerySchema } from '../schema'

export const dynamic = 'force-dynamic'
const DAY = 86_400_000

export async function GET(req: Request) {
  if (!moderationAdminEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:moderation:desk:${user.id}`, 100, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    const parsed = DeskQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query', 422)
    await requirePermission(req, PERMISSIONS.MODERATION_QUEUE_READ)

    const admin = createAdminClient()
    const now = new Date()
    let data: unknown
    let returned = 0

    if (parsed.data.view === 'queue') {
      const { data: rows, error } = await admin.from('moderation_queue')
        .select('id, type, status, priority, reported_by, target_type, target_id, reason, metadata, created_at')
        .in('status', ['pending', 'in_review']).order('priority', { ascending: false }).order('created_at', { ascending: true }).limit(50)
      if (error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
      const items = (rows ?? []) as Array<{ id: string; type: string; status: string; priority: number; reported_by: string | null; target_type: string; target_id: string; reason: string | null; metadata: { details?: string | null } | null; created_at: string }>
      const targets = await Promise.all(items.map((i) => resolveTarget(admin, i.target_type, i.target_id)))
      const strikeCache = new Map<string, Promise<ActiveStrike[]>>()
      const trustCache = new Map<string, ReturnType<typeof reporterTrust>>()
      const sameTarget = new Map<string, number>()
      for (const i of items) sameTarget.set(`${i.target_type}:${i.target_id}`, (sameTarget.get(`${i.target_type}:${i.target_id}`) ?? 0) + 1)
      data = await Promise.all(items.map(async (i, idx) => {
        const t = targets[idx]
        const strikes = t.subjectId ? await (strikeCache.get(t.subjectId) ?? strikeCache.set(t.subjectId, activeStrikes(admin, t.subjectId, now).catch(() => [])).get(t.subjectId)!) : []
        const trust = i.reported_by ? await (trustCache.get(i.reported_by) ?? trustCache.set(i.reported_by, reporterTrust(admin, i.reported_by)).get(i.reported_by)!) : null
        const ageHours = Math.floor((now.getTime() - new Date(i.created_at).getTime()) / 3_600_000)
        return {
          id: i.id, type: i.type, status: i.status, priority: i.priority, reason: i.reason, note: i.metadata?.details ?? null,
          target_type: i.target_type, target_id: i.target_id, created_at: i.created_at, age_hours: ageHours, overdue: isOverdue(i.priority, i.created_at, now),
          reports_on_target: sameTarget.get(`${i.target_type}:${i.target_id}`) ?? 1,
          target: { exists: t.exists, subject_id: t.subjectId, feature: t.feature, summary: t.context?.summary ?? '', body: t.context?.body ?? null, review_id: t.context?.reviewId ?? null },
          strikes: strikes.map((s) => ({ id: s.id, rule_group: s.rule_group, feature: s.feature, severity: s.severity, expires: s.strike_expires_at })),
          reporter_trust: trust,
        }
      }))
      returned = items.length
    } else if (parsed.data.view === 'appeals') {
      const { data: rows, error } = await admin.from('moderation_appeals').select('id, decision_id, source, message, status, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(50)
      if (error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
      const appeals = (rows ?? []) as Array<{ id: string; decision_id: string; source: string; message: string; status: string; created_at: string }>
      const { data: ds } = appeals.length ? await admin.from('moderation_decisions').select('id, created_at, reviewer_id, rule_group, feature, severity, outcome, restrict_days, content_type, reason').in('id', appeals.map((a) => a.decision_id)) : { data: [] }
      const byId = new Map(((ds ?? []) as Array<{ id: string; reviewer_id: string | null }>).map((d) => [d.id, d]))
      data = appeals.map((a) => {
        const d = byId.get(a.decision_id)
        return { ...a, same_reviewer: !!d && d.reviewer_id === user.id, decision: d ? { ...d, reviewer_id: undefined } : null }
      })
      returned = appeals.length
    } else {
      const since = new Date(now.getTime() - 30 * DAY).toISOString()
      const [open, closed, appeals, decisions] = await Promise.all([
        admin.from('moderation_queue').select('priority, created_at').in('status', ['pending', 'in_review']).limit(5000),
        admin.from('moderation_queue').select('status, created_at, resolved_at').in('status', ['resolved', 'dismissed']).gte('resolved_at', since).limit(5000),
        admin.from('moderation_appeals').select('status').limit(5000),
        admin.from('moderation_decisions').select('outcome').gte('created_at', since).limit(5000),
      ])
      if (open.error || closed.error || appeals.error || decisions.error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
      const o = (open.data ?? []) as Array<{ priority: number; created_at: string }>
      const c = (closed.data ?? []) as Array<{ status: string; created_at: string; resolved_at: string | null }>
      const handled = c.filter((r) => r.resolved_at).map((r) => (new Date(r.resolved_at as string).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
      const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length
      const a = (appeals.data ?? []) as Array<{ status: string }>
      const d = (decisions.data ?? []) as Array<{ outcome: string }>
      data = {
        open: o.length, open_urgent: count(o, (r) => r.priority >= 3), overdue_24h: count(o, (r) => (now.getTime() - new Date(r.created_at).getTime()) / 3_600_000 > 24),
        overdue_target: count(o, (r) => isOverdue(r.priority, r.created_at, now)),
        resolved_30d: count(c, (r) => r.status === 'resolved'), dismissed_30d: count(c, (r) => r.status === 'dismissed'),
        avg_handling_hours_30d: handled.length ? Math.round((handled.reduce((s, h) => s + h, 0) / handled.length) * 10) / 10 : null,
        appeals_pending: count(a, (r) => r.status === 'pending'), appeals_reversed: count(a, (r) => r.status === 'reversed'), appeals_upheld: count(a, (r) => r.status === 'upheld'),
        decisions_30d: { warning: count(d, (r) => r.outcome === 'warning'), content_removed: count(d, (r) => r.outcome === 'content_removed'), restricted: count(d, (r) => r.outcome === 'restricted'), banned: count(d, (r) => r.outcome === 'banned') },
      }
      returned = 1
    }

    writeAuditLog({
      actorId: user.id, actorEmail: user.email ?? '—', actorRole: auditActorRole(actor),
      action: 'moderation.queue_listed', targetType: 'moderation_queue', targetId: parsed.data.view,
      // A count and the view. Never the items.
      metadata: { view: parsed.data.view, returned }, req,
    })
    return Response.json({ data })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
