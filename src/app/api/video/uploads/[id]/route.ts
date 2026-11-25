import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { videoSourceBucket } from '@/lib/media/video/sourceStorage'
import { supabaseVideoAssetStore } from '@/lib/media/video/assetStore'
import { getTranscoderClient } from '@/lib/media/video/transcoder'
import { advanceVideoAsset } from '@/lib/media/video/processing'
import { buildModerationDeps } from '@/lib/media/video/moderationWiring'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/video/uploads/[id] — where is MY video in its life, and move it one step if it is waiting for one (Explore video part 4).
 *
 * OFF by default (404 while EXPLORE_VIDEO_PIPELINE_ENABLED is not "true"). Only the owner's own asset: someone else's and an unknown id answer the same 404. Asking is what drives
 * the transcode forward (no Pub/Sub yet): it claims an uploaded video, polls a running job, and replaces a failed one, all idempotent, so the app can simply poll this.
 * The answer is { assetId, state } and nothing else: no key, no job id, no error detail.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const locale = requestLocale(req)
  if (!exploreVideoPipelineEnabled()) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  }

  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })

  // An app polls: the limit is generous, but it is a limit (each call may reach the transcoder).
  const rl = await publicRateLimit(`video-status:${user.id}`, 120, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'upload_video')

  const notFound = () => NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  if (!UUID.test(params.id)) return notFound()

  const store = supabaseVideoAssetStore(createAdminClient())
  const asset = await store.get(params.id)
  if (!asset || asset.owner_id !== user.id) return notFound()

  const bucket = videoSourceBucket(process.env)
  if (!bucket) return NextResponse.json({ assetId: asset.id, state: asset.state })

  try {
    // VID-03: a video in `moderating` is moved by the moderation step (AI consent, evidence, decision). null when it cannot be built: the video waits.
    const moderation = buildModerationDeps({ store, admin: createAdminClient(), req })
    const advanced = await advanceVideoAsset(asset.id, { store, transcoder: getTranscoderClient(process.env, req), bucket, moderation })
    return NextResponse.json({ assetId: asset.id, state: advanced?.state ?? asset.state })
  } catch {
    // The step failing is ours; the caller still gets the last known state and polls again.
    return NextResponse.json({ assetId: asset.id, state: asset.state })
  }
}
