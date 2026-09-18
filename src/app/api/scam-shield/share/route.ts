import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'
import { apiError } from '@/lib/http/apiError'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { publicDailyRateLimit } from '@/lib/security/publicRateLimit'
import { SCAM_SHARE_DAILY_LIMIT_PER_IP } from '@/lib/config/product'
import { CHECK_RATE_LIMIT_MAX, CHECK_RATE_LIMIT_WINDOW_MS } from '@/lib/scam-shield/config'
import { checkUrl } from '@/lib/scam-shield'
import { buildScamSharePayload, scamShareSummary } from '@/lib/share/scamSharePayload'
import { createSharedResult, SharedResultError } from '@/lib/share/sharedResultStore'
import { notifyIndexNow } from '@/lib/discovery/indexNow'
import { absoluteUrl } from '@/lib/share/openGraph'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/scam-shield/share  { url, locale? }  → { slug, url, host, level }
//
// The G1 wedge: a Scam Shield verdict becomes a public, shareable result page
// (/r/<slug>) so the person who checked a suspicious link can warn the group
// it came from. Anonymous callers are allowed — deliberately — because the
// payload is built server-side from the deterministic check (no user prose,
// no memory, nothing to spam with); see src/lib/share/scamSharePayload.ts.
//
// Cost: the same providers the check route already runs (cached, no LLM),
// one INSERT. Capped by the check route's burst limit and a per-IP daily cap.
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const bodySchema = z.object({
  url: z.string().min(4).max(2048),
  locale: z.enum(['vi', 'en']).optional(),
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`ss-share:${ip}`, CHECK_RATE_LIMIT_MAX, CHECK_RATE_LIMIT_WINDOW_MS).ok) return apiError(req, 'rate_limit', 'scam.tooManyChecks', 429)
  const daily = await publicDailyRateLimit(`ss-share-daily:${ip}`, SCAM_SHARE_DAILY_LIMIT_PER_IP)
  if (!daily.ok) return apiError(req, 'share_daily_limit', 'rate.retryTomorrow', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError(req, 'invalid_body', 'scam.invalidBody', 400) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(req, 'invalid_input', 'scam.invalidUrl', 400)

  // Identity is optional here: an anonymous session still owns its verdict
  // page (unlisted), a real account owns a listed one. No identity at all is
  // fine too — the content is the server's, not the caller's.
  const { user } = await getRequestUser(req)

  try {
    const result = await checkUrl(parsed.data.url)
    const locale = parsed.data.locale ?? (requestLocale(req) === 'en' ? 'en' : 'vi')
    const payload = buildScamSharePayload(result, locale)
    const row = await createSharedResult({
      ownerId: user?.id ?? null,
      payload,
      ownerIsAnonymous: !user || isAnonymousUser(user),
    })
    const path = `/r/${row.slug}`
    if (!row.owner_is_anonymous) notifyIndexNow([path]) // listed pages only; env-gated; fire-and-forget
    return NextResponse.json({ id: row.id, slug: row.slug, path, url: absoluteUrl(path), ...scamShareSummary(result), listed: !row.owner_is_anonymous }, { status: 201 })
  } catch (err) {
    if (err instanceof SharedResultError) {
      return NextResponse.json({ error: 'not_shareable', reason: err.message, message: serverMessage('share.notShareable', requestLocale(req)) }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : 'Check failed'
    if (message.includes('private') || message.includes('internal')) return apiError(req, 'private_url', 'scam.privateUrl', 400)
    console.error('[scam-shield/share] failed:', message)
    return apiError(req, 'check_failed', 'scam.checkFailed', 500)
  }
}
