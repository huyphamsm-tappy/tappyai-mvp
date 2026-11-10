// POST /api/admin/video-moderation/[id]/decide — a reviewer's decision on a video waiting for review (Explore video VID-03).
// Body { decision: 'approve' | 'reject', note }. The note is REQUIRED. Behind EXPLORE_VIDEO_PIPELINE_ENABLED (404 off).
//
// Permission follows the outcome, as the report desk does: approve = "no violation" (moderation.report.dismiss), reject = hide (moderation.content.hide). A video with a
// suspected child-safety case (a `csam_suspected` event) can be REJECTED by a moderator, but APPROVING it needs the permission the moderator role is denied (moderation.content.delete):
// the AI never decided it, and a single moderator must not be the one to clear it.
//
// The decision is one database call (video_moderation_review_decide): it appends a human row to the append-only history and moves the video through the transition function
// (approve -> ready + approved, reject -> rejected). Idempotent: a repeat of the SAME decision answers 200 with changed=false and writes nothing; the OPPOSITE decision after one was
// made answers 409. A video that is not in review answers 409. Nothing here publishes: `ready` is not `published`.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, requireAdminIdentity, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { supabaseVideoModerationAdminStore } from '@/lib/media/video/moderationAdminStore'
import { DecideSchema, isUuid } from '../../schema'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!exploreVideoPipelineEnabled()) return new Response(null, { status: 404 })
  try {
    const { user, actor } = await requireAdminIdentity(req)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:video-moderation:decide:${user.id}`, 30, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'Invalid video id', 422)
    const parsed = DecideSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    const { decision, note } = parsed.data

    // ONE permission decision (the single-decision-path rule). Whether approving needs the stronger permission depends on whether the case is a suspected child-safety one, which
    // is read first: the caller is already a verified admin (requireAdminIdentity above), the read has no side effect, and nothing from it is returned before the permission check.
    const store = supabaseVideoModerationAdminStore(createAdminClient())
    let detail
    try { detail = await store.detail(params.id) } catch (e) {
      console.error('[admin][video-moderation][decide] read failed:', e instanceof Error ? e.message : e)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    const needed = decision === 'reject' ? PERMISSIONS.MODERATION_CONTENT_HIDE : detail?.severe ? PERMISSIONS.MODERATION_CONTENT_DELETE : PERMISSIONS.MODERATION_REPORT_DISMISS
    await requirePermission(req, needed)
    if (!detail) return adminError('NOT_FOUND', 'Video not found', 404)

    let outcome: { state: string; changed: boolean }
    try { outcome = await store.decide(params.id, decision, note, `user:${user.id}`) } catch (e) {
      console.error('[admin][video-moderation][decide] write failed:', e instanceof Error ? e.message : e)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    if (!outcome.changed) {
      // Nothing was written. The same decision already stands (a retry; an approved video may since have been published): fine. Anything else (the other decision, or a video that was never in review): a conflict.
      const standing = decision === 'approve' ? outcome.state === 'ready' || outcome.state === 'published' : outcome.state === 'rejected'
      if (standing) return Response.json({ data: { assetId: params.id, state: outcome.state, changed: false } })
      return adminError('CONFLICT', 'This video is not waiting for review or was already decided differently', 409)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(actor),
      action: decision === 'approve' ? 'video_moderation.approved' : 'video_moderation.rejected',
      targetType: 'video_asset',
      targetId: params.id,
      beforeState: { state: 'review_required' },
      afterState: { state: outcome.state },
      // The note is the reviewer's own words about the user's video: kept in the decision history, not copied into the (wider-read) audit log.
      metadata: { severe: detail.severe },
      req,
    })
    return Response.json({ data: { assetId: params.id, state: outcome.state, changed: true } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
