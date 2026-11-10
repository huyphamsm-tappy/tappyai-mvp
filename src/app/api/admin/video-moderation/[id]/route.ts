// GET /api/admin/video-moderation/[id] — one video with its evidence for the reviewer (Explore video VID-03): the state, the scores per kind, the transcript, the history of decisions and events.
// The six frames are NOT here: they are served by ./frame from the private bucket. No object key, no bucket, no URL of the bucket in the answer.
// Behind EXPLORE_VIDEO_PIPELINE_ENABLED (404 off). Moderator+ (the report queue's read permission). Opening a video is audited: the transcript is the user's speech.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { supabaseVideoModerationAdminStore } from '@/lib/media/video/moderationAdminStore'
import { isUuid } from '../schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!exploreVideoPipelineEnabled()) return new Response(null, { status: 404 })
  try {
    const ctx = await requirePermission(req, PERMISSIONS.MODERATION_QUEUE_READ)
    const { user } = ctx
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:video-moderation:get:${user.id}`, 100, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'Invalid video id', 422)

    let detail
    try {
      detail = await supabaseVideoModerationAdminStore(createAdminClient()).detail(params.id)
    } catch (e) {
      console.error('[admin][video-moderation] read failed:', e instanceof Error ? e.message : e)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    if (!detail) return adminError('NOT_FOUND', 'Video not found', 404)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'video_moderation.opened',
      targetType: 'video_asset',
      targetId: params.id,
      metadata: { state: detail.asset.state, severe: detail.severe },
      req,
    })
    return Response.json({ data: { ...detail, frameUrl: `/api/admin/video-moderation/${params.id}/frame` } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
