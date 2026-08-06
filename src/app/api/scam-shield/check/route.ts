import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { dailyRateLimit, clientIp, rateLimit } from '@/lib/security/rateLimit'
import { SCAM_SHIELD_DAILY_LIMIT_AUTH, SCAM_SHIELD_DAILY_LIMIT_ANON } from '@/lib/config/product'
import { checkUrl } from '@/lib/scam-shield'
import { CHECK_RATE_LIMIT_WINDOW_MS, CHECK_RATE_LIMIT_MAX } from '@/lib/scam-shield/config'

export const maxDuration = 15

const bodySchema = z.object({
  url: z.string().min(1).max(2048),
})

export async function POST(req: Request) {
  const ip = clientIp(req)
  const rl = rateLimit(`ss:${ip}`, CHECK_RATE_LIMIT_MAX, CHECK_RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: 'Too many checks. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const { user } = await getRequestUser(req)
  const dailyLimit = user ? SCAM_SHIELD_DAILY_LIMIT_AUTH : SCAM_SHIELD_DAILY_LIMIT_ANON
  const dailyKey = user ? `ss:daily:${user.id}` : `ss:daily:anon:${ip}`

  if (!dailyRateLimit(dailyKey, dailyLimit).ok) {
    return NextResponse.json(
      { error: 'daily_limit', message: 'Daily check limit reached.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body', message: 'Invalid request body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: 'Invalid URL' },
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
        { error: 'private_url', message: 'Cannot check internal network addresses' },
        { status: 400 },
      )
    }
    console.error('[scam-shield] check error:', message)
    return NextResponse.json(
      { error: 'check_failed', message: 'Could not check this URL' },
      { status: 500 },
    )
  }
}
