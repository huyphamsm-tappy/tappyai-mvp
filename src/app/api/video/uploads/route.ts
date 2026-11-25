import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { refuseIneligible } from '@/lib/account/requireEligibleUser'
import { refuseWithoutAiConsent } from '@/lib/ai/consent/aiConsentGuard'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { sameHostOrigin } from '@/lib/media/uploadRoute'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { hasClipConsent } from '@/lib/media/video/clipConsent'
import { getVideoSourceProvider } from '@/lib/media/video/sourceStorage'
import { supabaseVideoAssetStore } from '@/lib/media/video/assetStore'
import { startVideoUpload } from '@/lib/media/video/uploadFlow'

/**
 * POST /api/video/uploads — start the upload of the ORIGINAL file of an Explore video into the PRIVATE source bucket (Explore video plan, part 2).
 *
 * OFF by default: while EXPLORE_VIDEO_PIPELINE_ENABLED is not the string "true" this answers 404 as if the route did not exist, before anything else runs.
 * Order when on: the session; not anonymous; a per-minute limit; 18+ (the write is authorised here, the bytes never pass through this server); the account's acceptance of the
 * clip conditions (video_consent_required: a clip's frames, speech and text are later sent to an AI provider for moderation, so without it no session is opened: owner 05/11/2026)
 * and then the existing AI-data consent (ai_consent_required, for accounts that used the iOS app);
 * the private bucket must be configured (no default); then the body { idempotencyKey, contentType, size } goes to the flow.
 *
 * The answer is { assetId, state, uploadUrl, contentType }: never an object key, a bucket name or a public URL. The app then PUTs the bytes to `uploadUrl`
 * and calls POST /api/video/uploads/[id]/complete.
 */
export async function POST(req: NextRequest) {
  const locale = requestLocale(req)
  if (!exploreVideoPipelineEnabled()) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  }

  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const rl = await publicRateLimit(`video-upload:${user.id}`, 30, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'upload_video')

  const ageRefusal = await refuseIneligible(req, supabase)
  if (ageRefusal) return ageRefusal
  // Owner 05/11/2026: EVERY account must accept the clip conditions before it can post a clip (the iOS-era AI consent below treats a web-only account as allowed, so it is not enough).
  if (!(await hasClipConsent(createAdminClient(), user.id))) {
    return NextResponse.json({ error: 'video_consent_required', message: serverMessage('video.consentRequired', locale) }, { status: 403 })
  }
  // The existing AI-data gate stays too: an account that used the iOS app and refused AI processing is still refused.
  const noConsent = await refuseWithoutAiConsent(user.id, locale)
  if (noConsent) return noConsent

  const target = getVideoSourceProvider(process.env, req)
  if (!target) return NextResponse.json({ error: 'video_unavailable', message: serverMessage('media.uploadFailed', locale) }, { status: 503 })

  let body: { idempotencyKey?: unknown; contentType?: unknown; size?: unknown } | null
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = null
  }
  if (!body || typeof body.idempotencyKey !== 'string' || typeof body.contentType !== 'string' || typeof body.size !== 'number') {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  }

  const out = await startVideoUpload(
    { ownerId: user.id, idempotencyKey: body.idempotencyKey, contentType: body.contentType, size: body.size, origin: sameHostOrigin(req) },
    { store: supabaseVideoAssetStore(createAdminClient()), provider: target.provider, bucket: target.bucket },
  )
  return NextResponse.json(out.body, { status: out.status })
}
