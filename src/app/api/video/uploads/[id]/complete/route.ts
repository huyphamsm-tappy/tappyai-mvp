import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { getVideoSourceProvider } from '@/lib/media/video/sourceStorage'
import { supabaseVideoAssetStore } from '@/lib/media/video/assetStore'
import { completeVideoUpload } from '@/lib/media/video/uploadFlow'
import { getTranscoderClient } from '@/lib/media/video/transcoder'
import { advanceVideoAsset } from '@/lib/media/video/processing'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/video/uploads/[id]/complete — the app says the bytes are in; the SERVER checks (Explore video plan, part 2).
 *
 * OFF by default (404 while EXPLORE_VIDEO_PIPELINE_ENABLED is not "true"). The check itself (the object landed, the format by its bytes, no location or device
 * metadata left) is completeVideoUpload; this route only authenticates, limits, and finds the caller's own asset. Not gated by 18+ or consent on purpose: it only
 * CONFIRMS an object an authorised session already created, and refusing here would strand bytes that are already stored (same reasoning as POST /api/upload/video).
 * Someone else's asset and an unknown id answer the same 404.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const locale = requestLocale(req)
  if (!exploreVideoPipelineEnabled()) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  }

  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const rl = await publicRateLimit(`video-upload-complete:${user.id}`, 60, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'upload_video')

  if (!UUID.test(params.id)) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })

  const target = getVideoSourceProvider(process.env, req)
  if (!target) return NextResponse.json({ error: 'video_unavailable', message: serverMessage('media.uploadFailed', locale) }, { status: 503 })

  const store = supabaseVideoAssetStore(createAdminClient())
  const out = await completeVideoUpload({ ownerId: user.id, assetId: params.id }, { store, provider: target.provider, bucket: target.bucket })

  // The upload is verified: start the transcode right away instead of waiting for the first status poll. Best effort — if it fails the video simply stays `uploaded`
  // (or `processing` with no job) and the next status call or the daily sweep carries it on, so a failure here must never turn a verified upload into an error.
  if (out.status === 200 && out.body.state === 'uploaded') {
    try {
      const advanced = await advanceVideoAsset(params.id, { store, transcoder: getTranscoderClient(process.env, req), bucket: target.bucket })
      if (advanced) return NextResponse.json({ assetId: params.id, state: advanced.state }, { status: 200 })
    } catch { /* picked up by the next poll or the sweep */ }
  }
  return NextResponse.json(out.body, { status: out.status })
}
