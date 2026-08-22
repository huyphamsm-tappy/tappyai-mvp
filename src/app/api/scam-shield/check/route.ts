import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { dailyRateLimit, clientIp, rateLimit } from '@/lib/security/rateLimit'
import { SCAM_SHIELD_DAILY_LIMIT_AUTH, SCAM_SHIELD_DAILY_LIMIT_ANON } from '@/lib/config/product'
import { checkUrl } from '@/lib/scam-shield'
import { CHECK_RATE_LIMIT_WINDOW_MS, CHECK_RATE_LIMIT_MAX } from '@/lib/scam-shield/config'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const maxDuration = 15

/**
 * 🚨 `.refine(isParseableUrl)` — B10.
 *
 * `{"url":"not a url"}` used to satisfy this schema (it is a non-empty string under 2048 chars),
 * reach `checkUrl`, and throw there when `new URL()` rejected it — landing in the catch-all below
 * as a **500 check_failed**. A caller who sent nonsense was told the SERVER had failed.
 *
 * A malformed URL is the caller's mistake, so it is refused at validation with a 400, and the 500
 * branch goes back to meaning what it says: something on our side broke.
 *
 * The parse mirrors `normalizeTarget` in `lib/scam-shield` exactly — bare hosts like
 * `vietcombank.com.vn` are legitimate input and must keep working, so a missing scheme is filled
 * in the same way here before parsing. Validating more strictly than the checker would start
 * rejecting URLs the product accepts.
 */
function isParseableUrl(value: string): boolean {
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  try {
    const url = new URL(candidate)
    return url.hostname.length > 0 && url.hostname.includes('.')
  } catch {
    return false
  }
}

const bodySchema = z.object({
  url: z.string().min(1).max(2048).refine(isParseableUrl, { message: 'unparseable_url' }),
})

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`ss:${ip}`, CHECK_RATE_LIMIT_MAX, CHECK_RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: serverMessage('scam.tooManyChecks', requestLocale(req)) },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const { user } = await getRequestUser(req)
  const dailyLimit = user ? SCAM_SHIELD_DAILY_LIMIT_AUTH : SCAM_SHIELD_DAILY_LIMIT_ANON
  const dailyKey = user ? `ss:daily:${user.id}` : `ss:daily:anon:${ip}`

  if (!dailyRateLimit(dailyKey, dailyLimit).ok) {
    return NextResponse.json(
      { error: 'daily_limit', message: serverMessage('scam.dailyLimit', requestLocale(req)) },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body', message: serverMessage('scam.invalidBody', requestLocale(req)) }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: serverMessage('scam.invalidUrl', requestLocale(req)) },
      { status: 400 },
    )
  }

  try {
    const result = await checkUrl(parsed.data.url)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Check failed'
    if (message.includes('private') || message.includes('internal')) {
      return NextResponse.json(
        { error: 'private_url', message: serverMessage('scam.privateUrl', requestLocale(req)) },
        { status: 400 },
      )
    }
    console.error('[scam-shield] check error:', message)
    return NextResponse.json(
      { error: 'check_failed', message: serverMessage('scam.checkFailed', requestLocale(req)) },
      { status: 500 },
    )
  }
}
