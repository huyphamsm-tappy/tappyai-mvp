import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { getAgeEligibility, ageEligibilityCode, type AgeEligibility } from './ageEligibility'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// ─────────────────────────────────────────────────────────────────────────────
// The product-access gate: authenticated, then 18+.
//
// ── WHAT THIS GUARDS, AND WHAT IT DOES NOT ───────────────────────────────────
//
// PRODUCT functionality — the things that constitute actual TappyAI usage —
// requires a real signed-in account AND 18+ eligibility. PUBLIC / marketing
// surfaces (the landing page, legal documents, `/api/config`, `/api/health`) are
// untouched and stay reachable without either.
//
// ── WHY AN ANONYMOUS SESSION IS REFUSED HERE ─────────────────────────────────
//
// A Supabase anonymous identity is a real `auth.uid()` on the `authenticated`
// role, so `getRequestUser` resolves it and every RLS policy keyed on
// `auth.uid()` accepts it. That is exactly why it has to be refused explicitly:
// "there is a user object" is NOT the same question as "this is an account".
//
// No age data is collected for anonymous sessions, by design and on instruction.
// An anonymous identity therefore has no answer to the 18+ question and cannot
// acquire one — `user_demographics` foreign-keys `profiles`, and
// `20260808c_handle_new_user_skip_anonymous.sql` gives an anonymous identity no
// `profiles` row. The refusal is `auth_required`, not an age error: the visitor
// is one sign-in away from being asked the real question, and telling them
// their age is the problem would be false.
//
// 🚨 This CHANGES existing behaviour. `/api/chat` currently serves anonymous
// sessions under a daily quota (`anon_chat_usage_increment`). Under the
// instruction that Chat constitutes product usage, that path now requires
// sign-in. The anonymous quota machinery is left in place and untouched — it is
// still what governs any surface that remains anonymous-accessible, and
// removing it would be an unrelated refactor.
// ─────────────────────────────────────────────────────────────────────────────

export type ProductAccessDenial =
  /** No session at all, or an anonymous session. */
  | 'auth_required'
  /** Signed in, but we have never asked for a date of birth. */
  | 'age_verification_required'
  /** Signed in, date of birth on file, below the minimum age. */
  | 'age_ineligible'

export type ProductAccess =
  | { ok: true; user: User; supabase: SupabaseClient; eligibility: AgeEligibility }
  | { ok: false; denial: ProductAccessDenial; status: 401 | 403; body: { error: string; message: string } }

/**
 * Resolves the caller and decides whether they may use product functionality.
 *
 * Order is authentication → account-ness → eligibility, and it matters: an
 * unauthenticated caller must never reach the eligibility read, both because
 * the read would be meaningless and because it would be a database round trip
 * on every unauthenticated request.
 *
 * Returns a result rather than throwing or returning a `Response`, so the caller
 * keeps its own error envelope, headers and logging. `body` is pre-built in the
 * request's locale because every current call site wants exactly that shape.
 */
export async function requireEligibleUser(req: Request): Promise<ProductAccess> {
  const { user, supabase } = await getRequestUser(req)
  const locale = requestLocale(req)

  if (!user || user.is_anonymous) {
    return {
      ok: false,
      denial: 'auth_required',
      status: 401,
      body: {
        error: 'auth_required',
        message: serverMessage('auth.accountRequired', locale),
      },
    }
  }

  const eligibility = await getAgeEligibility(supabase)

  if (eligibility.status === 'eligible') {
    return { ok: true, user, supabase, eligibility }
  }

  // `unknown` and `ineligible` are both refusals, but they are different
  // refusals and the client routes them differently: one opens the age form,
  // the other opens the blocked screen. A shared code would collapse that.
  const denial: ProductAccessDenial =
    eligibility.status === 'ineligible' ? 'age_ineligible' : 'age_verification_required'

  return {
    ok: false,
    denial,
    status: 403,
    body: {
      error: ageEligibilityCode(eligibility.status),
      message: serverMessage(
        eligibility.status === 'ineligible' ? 'age.ineligible' : 'age.verificationRequired',
        locale
      ),
    },
  }
}

/**
 * One-line age gate for a route that has ALREADY resolved and checked its user.
 *
 * Returns a refusal `Response` when the caller may not proceed, or `null` when
 * they may — the same shape as the existing `refuseAnonymousSocialWrite`, so a
 * route reads as a short list of guards rather than a nest of conditionals.
 *
 * Use this where the route already has its own 401 (and, for social writes, its
 * own anonymous refusal); use `requireEligibleUser` where the route has neither
 * and wants the whole decision made for it.
 */
export async function refuseIneligible(
  req: Request,
  supabase: SupabaseClient
): Promise<Response | null> {
  const eligibility = await getAgeEligibility(supabase)
  if (eligibility.status === 'eligible') return null

  return new Response(
    JSON.stringify({
      error: ageEligibilityCode(eligibility.status),
      message: serverMessage(
        eligibility.status === 'ineligible' ? 'age.ineligible' : 'age.verificationRequired',
        requestLocale(req)
      ),
    }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  )
}

/**
 * The denial as a JSON `Response`, for the routes that want one directly.
 *
 * Kept separate from `requireEligibleUser` so a caller that needs to add headers
 * (rate-limit hints, streaming content types) is not forced to unpick a built
 * response — the pattern `/api/chat` already follows for its own refusals.
 */
export function productAccessResponse(
  denied: Extract<ProductAccess, { ok: false }>
): Response {
  return new Response(JSON.stringify(denied.body), {
    status: denied.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
