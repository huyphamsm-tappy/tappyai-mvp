import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { videoSourceBucket } from '@/lib/media/video/sourceStorage'
import { supabaseVideoAssetStore } from '@/lib/media/video/assetStore'
import { getTranscoderClient } from '@/lib/media/video/transcoder'
import { reconcileProcessing } from '@/lib/media/video/processing'
import { buildModerationDeps } from '@/lib/media/video/moderationWiring'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// video-reconcile cron (Explore video part 4): the safety net behind "whoever asks advances the video". Finds videos that have sat in `processing` past the grace period — a lost
// request, a caller that died between claiming the video and creating the job, a job that never reported — and advances each one step (idempotent; a failed or timed-out job is
// replaced, up to the attempt limit). Daily; CRON secret required. Gated by EXPLORE_VIDEO_PIPELINE_ENABLED: while the feature is off there is nothing to reconcile and it
// answers 200 "skipped". Counts only are logged — never keys or job names.

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!exploreVideoPipelineEnabled()) return NextResponse.json({ ok: true, skipped: 'feature_off' })
  const bucket = videoSourceBucket(process.env)
  if (!bucket) return NextResponse.json({ ok: true, skipped: 'no_bucket' })
  try {
    const admin = createAdminClient()
    const store = supabaseVideoAssetStore(admin)
    // VID-03: the sweep also moves videos sitting in `moderating` (a provider that was down, a retry nobody asked for).
    const result = await reconcileProcessing(
      { store, transcoder: getTranscoderClient(process.env, req), bucket, moderation: buildModerationDeps({ store, admin, req }) },
      { limit: 50 },
    )
    console.log(JSON.stringify({ type: 'tappyai_cron', job: 'video-reconcile', ok: true, ...result }))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error(JSON.stringify({ type: 'tappyai_cron', job: 'video-reconcile', ok: false, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    return NextResponse.json({ ok: false, error: 'reconcile_failed' }, { status: 500 })
  }
}
