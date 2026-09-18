import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { apiError } from '@/lib/http/apiError'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { publicDailyRateLimit } from '@/lib/security/publicRateLimit'
import { SHARE_DAILY_LIMIT, SHARE_DAILY_LIMIT_PER_IP } from '@/lib/config/product'
import { parseShareRequest, resolveShareSource } from '@/lib/share/shareRequest'
import { createSharedResult, SharedResultError } from '@/lib/share/sharedResultStore'
import { absoluteUrl } from '@/lib/share/openGraph'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/shared-results — publish a frozen, sanitized public snapshot.
//
// Explicit only: reached from the share preview's Confirm. Owner-scoped
// (the source message is read through RLS), sanitized server-side, capped per
// identity and per IP. Returns the public URL. No LLM, one INSERT.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!rateLimit(`share-create:${ip}`, 20, 60_000).ok) return apiError(req, 'rate_limit', 'rate.tooFast', 429)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return apiError(req, 'unauthorized', 'auth.required', 401)
  // A public page is public content: the anonymous tier may READ and ASK, never publish.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let body: unknown
  try { body = await req.json() } catch { return apiError(req, 'invalid_request', 'validation.missingFields', 400) }
  const parsed = parseShareRequest(body)
  if (parsed === 'invalid_request') return apiError(req, 'invalid_request', 'validation.missingFields', 400)

  // Daily abuse ceilings — identity first, IP second (identity churn). Both
  // server-side; both configurable in product.ts; distributed when configured.
  const perUser = await publicDailyRateLimit(`share-daily:uid:${user.id}`, SHARE_DAILY_LIMIT)
  if (!perUser.ok) return apiError(req, 'share_daily_limit', 'rate.retryTomorrow', 429)
  const perIp = await publicDailyRateLimit(`share-daily:ip:${ip}`, SHARE_DAILY_LIMIT_PER_IP)
  if (!perIp.ok) return apiError(req, 'share_daily_limit', 'rate.retryTomorrow', 429)

  const resolved = await resolveShareSource(supabase, user.id, parsed)
  if (!resolved.ok) return apiError(req, resolved.code, 'server.notFound', 404)

  try {
    const row = await createSharedResult({ ownerId: user.id, payload: resolved.payload })
    const path = `/r/${row.slug}`
    return NextResponse.json({
      id: row.id,
      slug: row.slug,
      path,
      url: absoluteUrl(path),
      title: row.payload.title,
      domain: row.domain,
    }, { status: 201 })
  } catch (e) {
    if (e instanceof SharedResultError && e.code === 'invalid_payload') {
      return NextResponse.json({ error: 'not_shareable', reason: e.message, message: serverMessage('share.notShareable', requestLocale(req)) }, { status: 422 })
    }
    console.error('[shared-results] create failed:', e instanceof Error ? e.message : e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
