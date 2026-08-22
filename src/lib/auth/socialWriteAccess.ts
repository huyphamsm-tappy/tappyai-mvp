import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

/**
 * The boundary between "signed in" and "signed in as nobody".
 *
 * ============================================================================
 * WHY THIS EXISTS — B17
 * ============================================================================
 * A UAT probe using an ordinary anonymous session — the kind the chat flow mints for every
 * visitor — successfully liked a post, saved it, followed a user, posted a comment and created a
 * group. All five returned 200.
 *
 * Every route gates on `if (!user) return 401`, and an anonymous user IS a user: a real
 * `auth.users` row with `is_anonymous = true`. So the check that was meant to separate visitors
 * from members separated nobody. `is_anonymous` was consulted in exactly three places in the
 * whole codebase — the chat quota, the claim flow, and Controller — and in none of the social
 * mutations.
 *
 * ============================================================================
 * WHY READ-ONLY IS THE INTENDED CONTRACT, NOT A GUESS
 * ============================================================================
 * Two independent pieces of evidence, neither of them this file's opinion:
 *
 *  1. `src/app/login/page.tsx` states it twice — "access policy: browse + share + 5 AI
 *     questions/day, no writes" and "read-only social".
 *
 *  2. 🔑 `POST /api/auth/claim-anonymous` carries EXACTLY ONE thing into the account a visitor
 *     later signs into: their conversations. Nothing moves likes, saves, follows, comments or
 *     groups. Had anonymous social writes ever been intended, that content would be stranded on a
 *     throwaway identity the moment its author signed up — which is not a design anyone chose, it
 *     is what happens when a check is missing.
 *
 * So the anonymous tier is CHAT plus browsing. That is what this enforces.
 *
 * ============================================================================
 * WHAT IS DELIBERATELY STILL ALLOWED
 * ============================================================================
 * Only SOCIAL writes are refused — content and graph edges other people see. An anonymous
 * visitor keeps their own private state, because it is what makes the 5 free questions work at
 * all: conversations, chat memory, preferences, saved places, price watches, bookings. None of
 * that is visible to another user, and taking it away would break the anonymous experience the
 * product deliberately offers.
 *
 * 🚨 This is an API-layer boundary, not a replacement for RLS. It sits in front of the database's
 * own rules and refuses earlier and more legibly; it does not license anything below it to relax.
 */
export interface MaybeAnonymousUser {
  readonly is_anonymous?: boolean | null
}

interface LocaleBearingRequest {
  readonly url?: string
  readonly nextUrl?: { readonly searchParams: URLSearchParams }
  readonly headers?: { get?: (name: string) => string | null }
}

/** True for a real anonymous session; false for a registered account. */
export function isAnonymousUser(user: MaybeAnonymousUser | null | undefined): boolean {
  return user?.is_anonymous === true
}

/**
 * Returns a 403 to send back, or `null` when the caller may proceed.
 *
 * Used as an early return so a route reads:
 *
 *     const refusal = refuseAnonymousSocialWrite(req, user)
 *     if (refusal) return refusal
 *
 * 🚨 403, not 401. A 401 says "authenticate", and the caller already IS authenticated — a client
 * that retries a 401 by minting another anonymous session would loop forever. 403 says the
 * identity is understood and not permitted, which is exactly the situation, and tells the client
 * to offer sign-in instead.
 */
export function refuseAnonymousSocialWrite(
  req: LocaleBearingRequest,
  user: MaybeAnonymousUser | null | undefined,
): NextResponse | null {
  if (!isAnonymousUser(user)) return null
  return NextResponse.json(
    { error: 'account_required', message: serverMessage('auth.accountRequired', requestLocale(req)) },
    { status: 403 },
  )
}
