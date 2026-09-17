import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { evaluateGuestAge, guestAgeCookie } from '@/lib/account/guestAgeDeclaration'

/**
 * POST /api/age-declaration — a GUEST's 18+ self-declaration for the chat trial.
 *
 * Owner decision D1 (revised, 2026-09-17): guests keep V3's 5-question trial and
 * the age gate stays. A guest has no account row for a date of birth, so the
 * declaration is stored on the device as an HttpOnly cookie and re-evaluated by
 * the chat route on every request (`lib/account/guestAgeDeclaration.ts`).
 *
 * Writes NOTHING server-side — no database, no session. Accepts either
 * `{ dateOfBirth: 'YYYY-MM-DD' }` (the age-check form) or `{ confirm18: true }`.
 * An under-18 declaration is stored too, so the refusal is durable for the
 * device rather than a retry away. Signed-in accounts are not refused here —
 * the chat route ignores the cookie for them and uses `getAgeEligibility()`.
 *
 * Rate-limited per IP because it is anonymous and sets a cookie; the body is
 * one short field, never logged.
 */
export async function POST(req: NextRequest) {
  const locale = requestLocale(req)
  const flood = rateLimit(`age-declaration:${clientIp(req)}`, 10, 60_000)
  if (!flood.ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: serverMessage('rate.retryShortly', locale) },
      { status: 429, headers: { 'Retry-After': String(flood.retryAfter) } },
    )
  }

  let body: { dateOfBirth?: unknown; confirm18?: unknown } = {}
  try { body = await req.json() } catch { /* empty body ⇒ invalid below */ }

  const declared = body.confirm18 === true ? '18plus' : body.dateOfBirth
  const verdict = evaluateGuestAge(declared)
  if (verdict.status === 'unknown' || !verdict.value) {
    return NextResponse.json(
      { error: 'invalid_request', message: serverMessage('age.invalidDate', locale) },
      { status: 400 },
    )
  }

  const secure = req.nextUrl.protocol === 'https:'
  const res = NextResponse.json({ ageStatus: verdict.status })
  res.headers.set('Set-Cookie', guestAgeCookie(verdict.value, secure))
  return res
}
