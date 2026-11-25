// GET /api/admin/video-moderation — the videos waiting for a person (Explore video VID-03). Urgent first (suspected child-safety cases), then oldest first.
// Behind EXPLORE_VIDEO_PIPELINE_ENABLED (404 off). Same permission as the report queue (moderator+); reading it is audited (a count, never the items).

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { supabaseVideoModerationAdminStore } from '@/lib/media/video/moderationAdminStore'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export async function GET(req: Request) {
  if (!exploreVideoPipelineEnabled()) return new Response(null, { status: 404 })
  try {
    const ctx = await requirePermission(req, PERMISSIONS.MODERATION_QUEUE_READ)
    const { user } = ctx
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:video-moderation:list:${user.id}`, 100, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    let items
    try {
      items = await supabaseVideoModerationAdminStore(createAdminClient()).listPending(PAGE_SIZE)
    } catch (e) {
      console.error('[admin][video-moderation] list failed:', e instanceof Error ? e.message : e)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'video_moderation.queue_listed',
      targetType: 'video_moderation_queue',
      targetId: 'review_required',
      metadata: { returned: items.length },
      req,
    })
    return Response.json({ data: items })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
