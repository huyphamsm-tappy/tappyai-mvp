import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { exploreVideoPipelineEnabled } from '@/lib/media/video/flags'
import { VIDEO_CLIP_CONSENT_VERSION, hasClipConsent, recordClipConsent, withdrawClipConsent } from '@/lib/media/video/clipConsent'

/**
 * /api/video/consent — the account's acceptance of the conditions for posting a clip (owner 05/11/2026: no acceptance, no clip; watching is never affected).
 *   GET     -> { accepted, version }
 *   POST    body { accepted: true, version }  records the acceptance of the CURRENT wording (a stale or wrong version is refused)
 *   DELETE  withdraws it (afterwards the next upload asks again)
 * OFF by default (404 while EXPLORE_VIDEO_PIPELINE_ENABLED is not "true"). Signed-in, non-anonymous accounts only. The write goes through the service role after the account check.
 */
async function gate(req: NextRequest, writes: boolean): Promise<{ res?: Response; user?: { id: string }; locale: ReturnType<typeof requestLocale> }> {
  const locale = requestLocale(req)
  if (!exploreVideoPipelineEnabled()) return { locale, res: NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 }) }
  const { user } = await getRequestUser(req)
  if (!user) return { locale, res: NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 }) }
  if (writes) {
    const anon = refuseAnonymousSocialWrite(req, user)
    if (anon) return { locale, res: anon }
  }
  const rl = await publicRateLimit(`video-consent:${user.id}`, 30, 60_000)
  if (!rl.ok) return { locale, res: rateLimitedResponse(req, rl, 'upload_video') as NextResponse }
  return { user, locale }
}

export async function GET(req: NextRequest) {
  const g = await gate(req, false)
  if (g.res) return g.res
  if (!g.user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', g.locale) }, { status: 401 })
  const accepted = await hasClipConsent(createAdminClient(), g.user.id)
  return NextResponse.json({ accepted, version: VIDEO_CLIP_CONSENT_VERSION }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const g = await gate(req, true)
  if (g.res) return g.res
  if (!g.user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', g.locale) }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { accepted?: unknown; version?: unknown } | null
  if (body?.accepted !== true || body.version !== VIDEO_CLIP_CONSENT_VERSION) {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', g.locale) }, { status: 400 })
  }
  try {
    await recordClipConsent(createAdminClient(), g.user.id)
  } catch {
    return NextResponse.json({ error: 'consent_unavailable', message: serverMessage('server.error', g.locale) }, { status: 503 })
  }
  return NextResponse.json({ accepted: true, version: VIDEO_CLIP_CONSENT_VERSION })
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req, true)
  if (g.res) return g.res
  if (!g.user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', g.locale) }, { status: 401 })
  try {
    await withdrawClipConsent(createAdminClient(), g.user.id)
  } catch {
    return NextResponse.json({ error: 'consent_unavailable', message: serverMessage('server.error', g.locale) }, { status: 503 })
  }
  return NextResponse.json({ accepted: false, version: VIDEO_CLIP_CONSENT_VERSION })
}
