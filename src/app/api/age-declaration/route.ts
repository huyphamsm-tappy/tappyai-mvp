import { NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { evaluateGuestAge, guestAgeCookie, readGuestAgeDeclaration } from '@/lib/account/guestAgeDeclaration'
import { getAgeEligibility, recordAgeDeclaration } from '@/lib/account/ageEligibility'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { publicRateLimit } from '@/lib/security/publicRateLimit'

/**
 * POST /api/age-declaration — the 18+ ONE-BUTTON answer ("I confirm I am 18 or older" /
 * "I am under 18") for a guest and for a signed-in account.
 *
 * GUEST (no session, or an anonymous trial session). Owner decision D1 (revised, 2026-09-17): a
 * guest keeps V3's 5-question trial and the age gate stays. A guest has no account row, so the
 * declaration is stored on the device as an HttpOnly cookie and re-evaluated by the chat route on
 * every request (`lib/account/guestAgeDeclaration.ts`). Writes nothing server-side. Accepts
 * `{ dateOfBirth: 'YYYY-MM-DD' }`, `{ confirm18: true }` or `{ under18: true }`. An under-18
 * answer is stored too, so the refusal is durable for the device rather than a retry away, and a
 * later "I am 18" press on the same device does not undo it.
 *
 * SIGNED-IN ACCOUNT (owner decision 18/11/2026). `{ confirm18: true }` / `{ under18: true }` is
 * recorded on the account through `record_age_declaration()` (time + Terms version; the rules —
 * idempotent, a date of birth under 18 and a minor declaration never overridden — live in the
 * database). The answer is then RE-READ through `user_age_status()`; this route never decides
 * eligibility itself. The device cookie is written as well so the answer is also remembered on the
 * device. A `dateOfBirth` body is NOT an account write here: native apps and the legacy path keep
 * using `PATCH /api/profile`.
 *
 * FAIL CLOSED: if the write fails (database error, or the migration is not applied yet) the answer
 * is 503 and nobody is admitted; the account stays `unknown`.
 *
 * Rate-limited per IP because it is reachable without an account and sets a cookie; the body is
 * three short fields, never logged.
 */

/** A request that carries a session credential at all; a plain guest skips the account lookup. */
function carriesSession(req: NextRequest): boolean {
  if (req.headers.get('authorization')?.startsWith('Bearer ')) return true
  return /(?:^|;\s*)sb-[^=]*=/.test(req.headers.get('cookie') ?? '')
}

export async function POST(req: NextRequest) {
  const locale = requestLocale(req)
  const flood = await publicRateLimit(`age-declaration:${clientIp(req)}`, 10, 60_000)
  if (!flood.ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: serverMessage('rate.retryShortly', locale) },
      { status: 429, headers: { 'Retry-After': String(flood.retryAfter) } },
    )
  }

  let body: { dateOfBirth?: unknown; confirm18?: unknown; under18?: unknown } = {}
  try { body = await req.json() } catch { /* empty body ⇒ invalid below */ }

  const isButton = body.confirm18 === true || body.under18 === true
  // "Under 18" wins if both are somehow sent: the safe reading of an ambiguous answer.
  const declared = body.under18 === true ? 'under18' : body.confirm18 === true ? '18plus' : body.dateOfBirth
  const verdict = evaluateGuestAge(declared)
  if (verdict.status === 'unknown' || !verdict.value) {
    return NextResponse.json(
      { error: 'invalid_request', message: serverMessage('age.invalidDate', locale) },
      { status: 400 },
    )
  }

  const secure = req.nextUrl.protocol === 'https:'

  // ── Signed-in account: the answer goes on the account ──────────────────────
  if (isButton && carriesSession(req)) {
    let account: Awaited<ReturnType<typeof getRequestUser>> | null = null
    try { account = await getRequestUser(req) } catch { /* no usable session ⇒ treated as a guest */ }
    if (account?.user && !account.user.is_anonymous) {
      const recorded = await recordAgeDeclaration(account.supabase, body.under18 !== true)
      const unavailable = () => NextResponse.json(
        { error: 'age_unavailable', message: serverMessage('age.confirmUnavailable', locale) },
        { status: 503 },
      )
      if (recorded.result === 'failed' || recorded.result === 'unauthenticated' || recorded.result === 'invalid_terms_version') {
        return unavailable()
      }
      // Re-read: the database, not this route, says what the answer means (a date of birth under 18
      // or an earlier minor declaration outranks the button).
      const eligibility = await getAgeEligibility(account.supabase)
      if (eligibility.status === 'unknown') return unavailable()
      const res = NextResponse.json({
        ageStatus: eligibility.status,
        canCorrectAge: eligibility.canSelfCorrect,
        ageDeclaration: eligibility.declaration ?? null,
      })
      if (eligibility.status === verdict.status) {
        res.headers.set('Set-Cookie', guestAgeCookie(verdict.value, secure))
      }
      return res
    }
  }

  // ── Guest ──────────────────────────────────────────────────────────────────
  // A refusal already remembered on this device is not undone by pressing the adult button.
  if (body.confirm18 === true && body.under18 !== true && readGuestAgeDeclaration(req.headers).status === 'ineligible') {
    return NextResponse.json({ ageStatus: 'ineligible' })
  }

  const res = NextResponse.json({ ageStatus: verdict.status })
  res.headers.set('Set-Cookie', guestAgeCookie(verdict.value, secure))
  return res
}
