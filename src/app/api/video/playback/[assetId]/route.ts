import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { clientIpKey } from '@/lib/security/rateLimit'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { supabaseVideoDeliveryStore } from '@/lib/media/video/deliveryStore'
import { videoCdnConfig } from '@/lib/media/video/cdnCookie'
import { issueVideoPlayback } from '@/lib/media/video/playback'
import { supabaseOverlayStore } from '@/lib/media/video/overlay/overlayStore'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const dynamic = 'force-dynamic'

/**
 * POST /api/video/playback/[assetId] — ask to WATCH an Explore video (Explore video plan, publishing + delivery slice).
 *
 * OFF by default: while EXPLORE_VIDEO_PIPELINE_ENABLED is not the string "true" this answers 404 as if the route did not exist, before anything else runs.
 * Anyone who may see the post may play, signed in or not (a visitor watches the public feed); the limit is per user, or per hashed IP for a visitor. The decision is ONE function
 * (decidePlayback): published + approved + not deleted + the post public; the owner may also preview their own `ready` video. Every refusal is the same 404.
 *
 * Allowed: the CDN cookie for THAT video's folder only is set (HttpOnly, Secure, SameSite=Lax, 10 minutes, Domain from VIDEO_CDN_COOKIE_DOMAIN) and the answer carries the manifest URL
 * on the CDN host. A NATIVE player (body { "client": "native" }) also gets the cookie name and value in the JSON, because it must send it as a Cookie header itself.
 * Never cached. The signing key never leaves the server.
 */
export async function POST(req: NextRequest, { params }: { params: { assetId: string } }) {
  const locale = requestLocale(req)
  if (!exploreVideoPipelineEnabled()) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  }

  const { user } = await getRequestUser(req)
  const rl = await publicRateLimit(user ? `video-playback:u:${user.id}` : `video-playback:ip:${clientIpKey(req)}`, 240, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'video_playback')

  let native = false
  try {
    const body = (await req.json()) as { client?: unknown } | null
    native = body?.client === 'native'
  } catch { /* no body: a browser */ }

  const admin = createAdminClient()
  const out = await issueVideoPlayback(
    { assetId: params.assetId, viewerId: user?.id ?? null, native },
    { store: supabaseVideoDeliveryStore(admin), config: videoCdnConfig(process.env), overlay: supabaseOverlayStore(admin) },
  )

  const headers = new Headers({ 'Cache-Control': 'no-store' })
  if (out.setCookie) headers.append('Set-Cookie', out.setCookie)
  const body = out.status === 404 ? { ...out.body, message: serverMessage('video.notAvailable', locale) } : out.body
  return NextResponse.json(body, { status: out.status, headers })
}
