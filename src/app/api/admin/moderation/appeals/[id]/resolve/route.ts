// POST /api/admin/moderation/appeals/[id]/resolve — decide an appeal: `upheld` (the decision stands) or `reversed`.
// Behind MODERATION_ADMIN_ENABLED. One appeal per decision, resolved once. Admin-level permission (the same one that withholds
// hard-deleting content from a moderator).
//
// REVERSED: the content comes back (a post's publication state; a removed comment is re-inserted from the ledger's snapshot — if
// the snapshot was already purged the comment cannot be restored and the answer says so), the restriction or lock is lifted unless
// ANOTHER decision still justifies it, and the strike stops counting (activeStrikes ignores a reversed decision). The ledger row is
// never edited: the appeal row records the outcome. The person is told either way.
//
// The reviewer should differ from the one who decided. With a single reviewer that is impossible, so it is RECORDED (`same_reviewer`)
// and shown on the desk; set MODERATION_APPEAL_DIFFERENT_REVIEWER=true to forbid it once there are two.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, requireAdminIdentity, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { publicationStateFor } from '@/lib/admin/moderation/moderationService'
import { unsuspendUser, unbanUser } from '@/lib/admin/users/accountStatusAdmin'
import { emitNotification } from '@/lib/notifications/emit'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'
import { AppealResolveSchema, isUuid } from '../../../schema'

export const dynamic = 'force-dynamic'

interface DecisionRow { id: string; queue_id: string | null; subject_user_id: string | null; reviewer_id: string | null; outcome: string; restrict_days: number | null; content_type: string | null; content_id: string | null; content_snapshot: { review_id?: string; body?: string; created_at?: string; parent_comment_id?: string | null } | null; created_at: string }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!moderationAdminEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:moderation:appeal-resolve:${user.id}`, 20, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'Invalid appeal id', 422)
    const parsed = AppealResolveSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    await requirePermission(req, PERMISSIONS.MODERATION_CONTENT_DELETE)

    const admin = createAdminClient()
    const { data: ap, error } = await admin.from('moderation_appeals').select('id, decision_id, status').eq('id', params.id).maybeSingle()
    if (error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    const appeal = ap as { id: string; decision_id: string; status: string } | null
    if (!appeal) return adminError('NOT_FOUND', 'Appeal not found', 404)
    if (appeal.status !== 'pending') return adminError('CONFLICT', 'This appeal has already been resolved', 409)
    const { data: dr } = await admin.from('moderation_decisions').select('id, queue_id, subject_user_id, reviewer_id, outcome, restrict_days, content_type, content_id, content_snapshot, created_at').eq('id', appeal.decision_id).maybeSingle()
    const d = dr as DecisionRow | null
    if (!d) return adminError('NOT_FOUND', 'Decision not found', 404)

    const sameReviewer = d.reviewer_id === user.id
    if (sameReviewer && process.env.MODERATION_APPEAL_DIFFERENT_REVIEWER === 'true') {
      return adminError('FORBIDDEN', 'An appeal must be decided by a different reviewer', 403)
    }

    const restored: Record<string, boolean | null> = { content: null, restriction_lifted: null, ban_lifted: null }
    if (parsed.data.result === 'reversed') {
      // content
      if (d.outcome === 'content_removed' && d.content_id) {
        if (d.content_type === 'review') {
          const { error: e } = await admin.from('reviews').update({ publication_state: publicationStateFor('restore') }).eq('id', d.content_id)
          if (e) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
          restored.content = true
        } else if (d.content_type === 'comment') {
          const s = d.content_snapshot
          if (s?.review_id && s.body && d.subject_user_id) {
            const { error: e } = await admin.from('review_comments').insert({ id: d.content_id, review_id: s.review_id, user_id: d.subject_user_id, body: s.body, created_at: s.created_at, parent_comment_id: s.parent_comment_id ?? null })
            if (e && (e as { code?: string }).code !== '23505') return adminError('INTERNAL_ERROR', 'Operation failed', 500)
            restored.content = true
          } else restored.content = false // the snapshot was purged (or the account is gone): nothing to restore
        }
      }
      // restriction / lock — lifted only if no OTHER standing decision of the same kind still justifies it
      if (d.subject_user_id && (d.outcome === 'restricted' || d.outcome === 'banned')) {
        const { data: others } = await admin.from('moderation_decisions').select('id, outcome, restrict_days, created_at').eq('subject_user_id', d.subject_user_id).eq('outcome', d.outcome).neq('id', d.id)
        const list = (others ?? []) as Array<{ id: string; restrict_days: number | null; created_at: string }>
        const { data: won } = list.length ? await admin.from('moderation_appeals').select('decision_id').in('decision_id', list.map((o) => o.id)).eq('status', 'reversed') : { data: [] }
        const reversed = new Set(((won ?? []) as Array<{ decision_id: string }>).map((w) => w.decision_id))
        const nowMs = Date.now()
        const standing = list.some((o) => !reversed.has(o.id) && (d.outcome === 'banned' || new Date(o.created_at).getTime() + (o.restrict_days ?? 0) * 86_400_000 > nowMs))
        if (!standing) {
          try {
            if (d.outcome === 'restricted') { await unsuspendUser(admin, d.subject_user_id); restored.restriction_lifted = true } else { await unbanUser(admin, d.subject_user_id); restored.ban_lifted = true }
          } catch { return adminError('INTERNAL_ERROR', 'Operation failed', 500) }
        } else if (d.outcome === 'restricted') restored.restriction_lifted = false
        else restored.ban_lifted = false
      }
      await admin.from('moderation_actions').insert({
        queue_id: d.queue_id, action: d.outcome === 'banned' ? 'restore_user' : d.outcome === 'restricted' ? 'unsuspend_user' : 'restore_content', actor_id: user.id,
        target_user_id: d.subject_user_id, target_content_id: d.content_id, reason: parsed.data.note,
      })
    }

    const { error: upd } = await admin.from('moderation_appeals').update({
      status: parsed.data.result, resolved_by: user.id, resolved_at: new Date().toISOString(), same_reviewer: sameReviewer, resolution_note: parsed.data.note,
    }).eq('id', appeal.id).eq('status', 'pending')
    if (upd) { console.error('[admin][moderation][appeal] update failed:', upd.message); return adminError('INTERNAL_ERROR', 'Operation failed', 500) }

    writeAuditLog({
      actorId: user.id, actorEmail: user.email ?? '—', actorRole: auditActorRole(actor), action: `moderation.appeal_${parsed.data.result}`,
      targetType: 'moderation_decision', targetId: d.id, metadata: { appeal_id: appeal.id, result: parsed.data.result, same_reviewer: sameReviewer, restored }, req,
    })
    let notified = false
    if (d.subject_user_id) {
      const reversed = parsed.data.result === 'reversed'
      const r = await emitNotification({
        userId: d.subject_user_id, type: 'system', category: 'system',
        title: 'Kết quả kháng nghị · Appeal result',
        body: reversed
          ? 'Mình đã xem lại và đảo ngược quyết định: nội dung/tài khoản của bạn được khôi phục và strike không còn được tính.\nWe reviewed your appeal and reversed the decision: your content/account is restored and the strike no longer counts.'
          : 'Mình đã xem lại kháng nghị và giữ nguyên quyết định. Mỗi quyết định được kháng nghị một lần; bạn vẫn có thể viết cho support@tappyai.com nếu có thông tin mới.\nWe reviewed your appeal and the decision stands. Each decision can be appealed once; write to support@tappyai.com if you have new information.',
        entityUrl: '/profile/notices', data: { decisionId: d.id, kind: 'moderation_appeal_result', result: parsed.data.result },
      })
      notified = r.id !== null
    }
    return Response.json({ data: { id: appeal.id, status: parsed.data.result, same_reviewer: sameReviewer, restored, subject_notified: notified } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
