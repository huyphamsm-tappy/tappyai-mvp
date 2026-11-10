// GET /api/admin/video-moderation/[id]/frame — the sprite sheet of six frames of a video waiting for review (Explore video VID-03), read from the PRIVATE bucket by the server and
// streamed to the reviewer. The bucket and the object key never reach the browser; the answer is never cacheable. Only a video that is in review is served.
// Behind EXPLORE_VIDEO_PIPELINE_ENABLED (404 off). Moderator+. Looking at the evidence is audited.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { videoAssetStagingPrefix } from '@/lib/media/key'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { supabaseVideoModerationAdminStore } from '@/lib/media/video/moderationAdminStore'
import { SPRITE_FILE } from '@/lib/media/video/moderationStep'
import { readWholeObject } from '@/lib/media/video/moderationWiring'
import { getVideoSourceProvider } from '@/lib/media/video/sourceStorage'
import { isUuid } from '../../schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!exploreVideoPipelineEnabled()) return new Response(null, { status: 404 })
  try {
    const ctx = await requirePermission(req, PERMISSIONS.MODERATION_QUEUE_READ)
    const { user } = ctx
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    const rl = await distributedRateLimit(`admin:video-moderation:frame:${user.id}`, 200, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'Invalid video id', 422)

    const source = getVideoSourceProvider(process.env, req)
    if (!source) return adminError('SERVICE_UNAVAILABLE', 'Video storage is not configured', 503)

    let bytes: Uint8Array | null
    try {
      const detail = await supabaseVideoModerationAdminStore(createAdminClient()).detail(params.id)
      if (!detail || detail.asset.state !== 'review_required') return adminError('NOT_FOUND', 'Video not found', 404)
      bytes = await readWholeObject(source.provider, `${videoAssetStagingPrefix(detail.asset.ownerId, detail.asset.id)}${SPRITE_FILE}`)
    } catch (e) {
      console.error('[admin][video-moderation] frame read failed:', e instanceof Error ? e.message : e)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    if (!bytes) return adminError('NOT_FOUND', 'Frames not found', 404)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'video_moderation.frames_viewed',
      targetType: 'video_asset',
      targetId: params.id,
      req,
    })
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="frames.jpg"' },
    })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
