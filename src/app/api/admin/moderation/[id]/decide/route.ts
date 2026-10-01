// POST /api/admin/moderation/[id]/decide — a reviewer's decision on one queue item, against the written community rules.
// Behind MODERATION_ADMIN_ENABLED (404 off).
//
// 🔑 A REPORT IS NOT A VERDICT. This route is the ONLY place a report's subject is touched, and only by a person who chooses an
// outcome and writes the reason. Nothing counts reports; nothing here is automatic. `suggestPenalty` is shown by the desk, not applied.
//
// Order (retry-safe; a second attempt can never double a strike):
//   1. the ledger row (immutable «sổ strike»). UNIQUE(queue_id): a retry finds the row it wrote and carries on.
//   2. the effect (hide / remove a comment / restrict / ban) through the EXISTING helpers (publication_state, suspendUser, banUser,
//      revokeAllSessions) — one way to hide a post, one way to suspend, one way to ban.
//   3. moderation_actions, the queue item closed, the hash-chained audit entry, the notice to the person.
// `no_violation` and `hold` write no ledger row (no person was sanctioned): the queue + moderation_actions + audit record them.
//
// Permission follows the outcome, as the existing resolve route does: dismiss, hide/warn, delete (a comment), suspend, ban.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, requireAdminIdentity, PERMISSIONS } from '@/lib/admin/permissions'
import type { PermissionId } from '@/lib/admin/permissions/types'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { publicationStateFor } from '@/lib/admin/moderation/moderationService'
import { suspendUser, suspensionExpiry, banUser } from '@/lib/admin/users/accountStatusAdmin'
import { revokeAllSessions, revocationSucceeded } from '@/lib/admin/sessions/revokeSessions'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { emitNotification } from '@/lib/notifications/emit'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { LADDER, LEDGER_OUTCOME, RULE_GROUPS, countsAsStrike, strikeExpiry, withinGroupMax, type Outcome, type Severity } from '@/lib/safety/communityRules'
import { activeStrikes, noticeFor, resolveTarget, strikeCounts } from '@/lib/safety/moderationDecisions'
import { DecideSchema, isUuid } from '../../schema'

export const dynamic = 'force-dynamic'

const PERMISSION_FOR: Record<'no_violation' | 'hold' | 'warning' | 'remove_post' | 'remove_comment' | 'restrict' | 'ban', PermissionId> = {
  no_violation: PERMISSIONS.MODERATION_REPORT_DISMISS,
  hold: PERMISSIONS.MODERATION_CONTENT_HIDE,
  warning: PERMISSIONS.MODERATION_CONTENT_HIDE,
  remove_post: PERMISSIONS.MODERATION_CONTENT_HIDE,
  remove_comment: PERMISSIONS.MODERATION_CONTENT_DELETE, // 12_RBAC §3 withholds hard delete from the moderator role
  restrict: PERMISSIONS.USERS_SUSPEND,
  ban: PERMISSIONS.USERS_BAN,
}

const ACTION_FOR: Record<Outcome, string> = {
  no_violation: 'dismiss_report', hold: 'hide_content', warning: 'warn', remove: 'hide_content', restrict: 'suspend_user', ban: 'ban_user',
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!moderationAdminEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    const actorRole = auditActorRole(actor)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:moderation:decide:${user.id}`, 30, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'Invalid queue item id', 422)
    const parsed = DecideSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    const body = parsed.data
    // «remove» is two wire outcomes because the permission differs (a post is hidden, a comment is deleted) and the permission must be
    // known BEFORE anything is read — one decision, asked once, from the request alone.
    const wire = body.outcome
    const outcome: Outcome = wire === 'remove_post' || wire === 'remove_comment' ? 'remove' : wire
    const permission: PermissionId = PERMISSION_FOR[wire]
    await requirePermission(req, permission)

    const admin = createAdminClient()
    const { data: itemRow, error: readError } = await admin.from('moderation_queue').select('id, status, target_type, target_id').eq('id', params.id).maybeSingle()
    if (readError) { console.error('[admin][moderation][decide] item read failed:', readError.message); return adminError('INTERNAL_ERROR', 'Operation failed', 500) }
    const item = itemRow as { id: string; status: string; target_type: string; target_id: string } | null
    if (!item) return adminError('NOT_FOUND', 'Queue item not found', 404)
    if (item.status === 'resolved' || item.status === 'dismissed') return adminError('CONFLICT', 'This item has already been resolved', 409)

    const target = await resolveTarget(admin, item.target_type, item.target_id)

    if (wire === 'remove_post' && target.kind !== 'review') return adminError('VALIDATION_ERROR', 'remove_post needs a reported post', 422)
    if (wire === 'remove_comment' && target.kind !== 'comment') return adminError('VALIDATION_ERROR', 'remove_comment needs a reported comment', 422)

    const nowIso = new Date().toISOString()
    let decisionId: string | null = null
    let sessionsRevoked: boolean | null = null

    // ── no violation / hold: no ledger row ──
    if (outcome === 'no_violation' || outcome === 'hold') {
      if (outcome === 'hold') {
        if (target.kind !== 'review' || !target.exists) return adminError('VALIDATION_ERROR', 'Only a reported post can be held while it waits', 422)
        const { error } = await admin.from('reviews').update({ publication_state: publicationStateFor('hide') }).eq('id', item.target_id)
        if (error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
      } else if (item.status === 'in_review' && target.kind === 'review' && target.exists) {
        // a post held while it waited, and the verdict is "no violation": it comes back
        await admin.from('reviews').update({ publication_state: publicationStateFor('restore') }).eq('id', item.target_id)
      }
    } else {
      // ── a penalty or a warning: a rule group is required ──
      if (!body.rule_group) return adminError('VALIDATION_ERROR', 'rule_group is required', 422)
      const group = RULE_GROUPS[body.rule_group]
      if (!target.exists || !target.subjectId) return adminError('VALIDATION_ERROR', 'The reported target no longer exists', 422)
      const severity = (body.severity ?? group.defaultSeverity) as Severity
      if (severity > group.maxSeverity) return adminError('VALIDATION_ERROR', 'Severity is above the highest this rule allows', 422)
      if (!withinGroupMax(body.rule_group, outcome)) return adminError('VALIDATION_ERROR', 'This penalty is above the maximum the rule allows', 422)
      if ((outcome === 'remove') && target.kind === 'user') return adminError('VALIDATION_ERROR', 'A profile has no content to remove — use warning, restrict or ban', 422)
      const feature = body.feature ?? target.feature
      let strikes
      try { strikes = await activeStrikes(admin, target.subjectId) } catch { return adminError('INTERNAL_ERROR', 'Operation failed', 500) }
      const counts = strikeCounts(strikes, body.rule_group, feature)
      // A ban follows severity 3, or the threshold of active strikes — never a count of reports.
      if (outcome === 'ban' && severity < 3 && counts.strikesTotal + 1 < LADDER.banAtStrikes) {
        return adminError('VALIDATION_ERROR', 'A ban needs severity 3, or enough active strikes (see the ladder)', 422)
      }
      if (outcome === 'restrict' && !body.restrict_days) return adminError('VALIDATION_ERROR', 'restrict_days is required', 422)
      if (outcome === 'ban' || outcome === 'restrict') {
        const denial = await guardMutationTarget(admin, { targetId: target.subjectId, actorId: user.id, actorEmail: user.email ?? '—', actorRole, intent: outcome === 'ban' ? 'user.ban' : 'user.suspend', req })
        if (denial) return denial
      }

      const ledgerOutcome = LEDGER_OUTCOME[outcome]
      const strike = countsAsStrike(ledgerOutcome)
      const expires = strike ? strikeExpiry(severity)?.toISOString() ?? null : null
      let snapshot: Record<string, unknown> | null = null
      if (outcome === 'remove' && target.kind === 'comment' && target.context) {
        snapshot = { review_id: target.context.reviewId, body: target.context.body, created_at: target.context.createdAt, parent_comment_id: target.context.parentCommentId ?? null }
      }
      const ins = await admin.from('moderation_decisions').insert({
        queue_id: item.id, subject_user_id: target.subjectId, reviewer_id: user.id, rule_group: body.rule_group, feature, severity,
        outcome: ledgerOutcome, strike, strike_expires_at: expires, restrict_days: outcome === 'restrict' ? body.restrict_days : null,
        content_type: target.kind, content_id: item.target_id, content_snapshot: snapshot, reason: body.reason,
      }).select('id').maybeSingle()
      if (ins.error) {
        if ((ins.error as { code?: string }).code === '23505') {
          // a retry after a half-finished attempt: the decision is already on the ledger — carry on, do not write a second strike
          const prev = await admin.from('moderation_decisions').select('id').eq('queue_id', item.id).maybeSingle()
          decisionId = (prev.data as { id: string } | null)?.id ?? null
        }
        if (!decisionId) { console.error('[admin][moderation][decide] ledger insert failed:', (ins.error as { code?: string }).code); return adminError('INTERNAL_ERROR', 'Operation failed', 500) }
      } else decisionId = (ins.data as { id: string } | null)?.id ?? null

      // the effect, through the existing helpers
      if (outcome === 'remove') {
        if (target.kind === 'review') {
          const { error } = await admin.from('reviews').update({ publication_state: publicationStateFor('hide') }).eq('id', item.target_id)
          if (error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
        } else {
          const { error } = await admin.from('review_comments').delete().eq('id', item.target_id)
          if (error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
        }
      } else if (outcome === 'restrict') {
        try { await suspendUser(admin, target.subjectId, suspensionExpiry((body.restrict_days as number) * 24)) } catch { return adminError('INTERNAL_ERROR', 'Operation failed', 500) }
      } else if (outcome === 'ban') {
        try { await banUser(admin, target.subjectId, body.reason) } catch { return adminError('INTERNAL_ERROR', 'Operation failed', 500) }
        sessionsRevoked = revocationSucceeded(await revokeAllSessions(admin, target.subjectId))
      }
    }

    // ── record, close, audit, notify ──
    const { error: actionError } = await admin.from('moderation_actions').insert({
      queue_id: item.id, action: ACTION_FOR[outcome], actor_id: user.id, target_user_id: target.subjectId, target_content_id: item.target_id,
      reason: body.reason, notes: body.notes ?? null, duration_hours: outcome === 'restrict' ? (body.restrict_days as number) * 24 : null,
    })
    if (actionError) { console.error('[admin][moderation][decide] action insert failed:', actionError.message); return adminError('INTERNAL_ERROR', 'Operation failed', 500) }
    const closed = outcome === 'hold' ? 'in_review' : outcome === 'no_violation' ? 'dismissed' : 'resolved'
    const { error: closeError } = await admin.from('moderation_queue').update(
      closed === 'in_review'
        ? { status: 'in_review', assigned_to: user.id, updated_at: nowIso }
        : { status: closed, resolved_by: user.id, resolved_at: nowIso, resolution: body.reason, updated_at: nowIso },
    ).eq('id', item.id)
    if (closeError) { console.error('[admin][moderation][decide] queue update failed:', closeError.message); return adminError('INTERNAL_ERROR', 'Operation failed', 500) }

    writeAuditLog({
      actorId: user.id, actorEmail: user.email ?? '—', actorRole,
      action: `moderation.${ACTION_FOR[outcome]}`, targetType: item.target_type, targetId: item.target_id,
      // The decision, the rule and the reason. NOT the reported content, nothing about the reporter.
      metadata: { queue_id: item.id, outcome: outcome, rule_group: body.rule_group ?? null, severity: body.severity ?? null, decision_id: decisionId, restrict_days: body.restrict_days ?? null, ...(sessionsRevoked === null ? {} : { sessions_revoked: sessionsRevoked }) },
      req,
    })

    let notified = false
    if (decisionId && target.subjectId && body.rule_group && outcome !== 'hold' && outcome !== 'no_violation') {
      const ledgerOutcome = LEDGER_OUTCOME[outcome]
      const sev = (body.severity ?? RULE_GROUPS[body.rule_group].defaultSeverity) as Severity
      const n = noticeFor({ decisionId, ruleGroup: body.rule_group, outcome: ledgerOutcome, restrictDays: outcome === 'restrict' ? (body.restrict_days as number) : null, contentType: target.kind, strikeExpiresAt: countsAsStrike(ledgerOutcome) ? strikeExpiry(sev)?.toISOString() ?? null : null })
      const res = await emitNotification({ userId: target.subjectId, type: 'system', category: 'system', title: n.title, body: n.body, entityUrl: n.entityUrl, data: { decisionId, kind: 'moderation_decision' } })
      notified = res.id !== null
    }
    return Response.json({ data: { id: item.id, status: closed, decision_id: decisionId, outcome: outcome, subject_notified: notified, ...(sessionsRevoked === null ? {} : { session_revocation_pending: !sessionsRevoked }) } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

