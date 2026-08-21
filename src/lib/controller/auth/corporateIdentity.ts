// Controller V2 — FOUNDATION-10C: the TRUSTED CORPORATE IDENTITY BOUNDARY.
// Owner decision 2026-08-09: OPTION B.
//
// WHAT THIS IS
// ------------
// Controller V2 is an internal-only TappyAI corporate tool. Every identity that
// reaches it must be a *verified corporate identity* — an `@tappyai.com` mailbox
// that Supabase Auth itself has confirmed. This module is the ONE place that
// decides that question.
//
// WHAT THIS IS NOT
// ----------------
// This is AUTHENTICATION, not AUTHORIZATION. Holding an `@tappyai.com` address
// grants nothing. After this boundary passes, the canonical chain is unchanged
// and still mandatory:
//
//   authentication → verified corporate identity → Actor → canonical PDP
//   → membership → department scope → role constraints → resource permission
//
// There is exactly ONE PDP (`lib/admin/permissions/engine.ts`), ONE audit writer
// (`lib/admin/audit.ts`) and ONE navigation authority (`resolveAdminNavigation`).
// This module adds none of them. It never reads a role, a membership, a
// department or a permission, and nothing here may ever be used as a substitute
// for one — an email domain is not a grant.
//
// TRUST MODEL — WHY THE INPUT IS TRUSTWORTHY
// ------------------------------------------
// The `email` this module reads must come from `supabase.auth.getUser()`, which
// (MEASURED in @supabase/auth-js 2.108.2, `GoTrueClient._getUser`) ALWAYS issues
// `GET <auth-url>/user` with the access token and returns the row the Auth
// server holds. There is no local-decode path. So the address is the one
// Supabase Auth stores in `auth.users`, not a client-supplied field, not a
// self-signed JWT claim, and not a request body.
//
// That is why this function takes a `VerifiedIdentity` object and never a bare
// string: callers cannot hand it an email they invented. `resolveActorForUser`
// — the single Actor construction site — enforces this before it builds an
// Actor, so an unverified or non-corporate identity never becomes a principal
// at all. UI routes, API routes and server components therefore inherit the
// same boundary; none of them can opt out.
//
// This project's Supabase instance is SHARED with the consumer app (open signup,
// Google, Facebook, email OTP, and anonymous sign-ins are all enabled and must
// stay that way). The boundary therefore lives in the Controller's trusted
// server layer and changes no global Supabase Auth configuration.

import type { User } from '@supabase/supabase-js'

/**
 * The corporate mail domain. Deliberately a source-level constant and NOT an
 * environment variable: an env-configurable security boundary can be silently
 * weakened — or pointed at an attacker-controlled domain — by a deploy that
 * never touches this file. Changing who may authenticate to the Controller
 * should require a code change, review and CI.
 */
export const CORPORATE_EMAIL_DOMAIN = 'tappyai.com'

export type CorporateIdentityDenial =
  /** No authenticated identity at all. */
  | 'NO_IDENTITY'
  /** A Supabase anonymous sign-in (consumer feature; never corporate). */
  | 'ANONYMOUS_IDENTITY'
  /** Authenticated, but the identity carries no email (e.g. phone-only). */
  | 'NO_EMAIL'
  /** Supabase Auth has not confirmed this address. */
  | 'EMAIL_UNVERIFIED'
  /** The stored address is not a single, well-formed, ASCII-domain address. */
  | 'MALFORMED_EMAIL'
  /** Verified and well-formed, but not a corporate mailbox. */
  | 'NON_CORPORATE_DOMAIN'

/**
 * The subset of the Supabase `User` this decision reads. Typed as a `Pick` of
 * the real `User` so it cannot drift from what `auth.getUser()` returns.
 */
export type VerifiedIdentity = Pick<User, 'email' | 'email_confirmed_at' | 'is_anonymous'>

export type CorporateIdentityResult =
  | { ok: true; email: string; domain: string }
  | { ok: false; reason: CorporateIdentityDenial }

/**
 * True when the string contains any space or control character. A stored
 * address containing one is rejected rather than normalised: trimming an
 * address into acceptance is how newline/space confusions get through, and a
 * real Supabase-confirmed mailbox never contains them.
 *
 * Written as a code-point scan rather than a regex character class ON PURPOSE.
 * This project has twice shipped source in which an escape collapsed into a
 * literal control byte, leaving a guard that matched nothing while reading as
 * correct. There is no escape sequence here to corrupt, and the test file
 * additionally asserts this source contains no stray control characters.
 */
function hasControlOrSpace(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * The domain must be plain ASCII letters/digits/dot/hyphen.
 *
 * APPLIED TO THE RAW DOMAIN, BEFORE LOWER-CASING — and that order is the point.
 * Some Unicode code points fold INTO ASCII: U+212A KELVIN SIGN lower-cases to a
 * plain `k`, so a domain containing it would pass an ASCII test performed after
 * normalisation. No such character can spell `tappyai.com` today, but that is a
 * property of which letters happen to be in the word, not of the check. Testing
 * the raw input makes "no non-ASCII character participates in this decision" a
 * structural guarantee that survives a future change of domain.
 *
 * Case-insensitive because the raw domain has not been normalised yet.
 */
const ASCII_DOMAIN = /^[A-Za-z0-9.-]+$/

const deny = (reason: CorporateIdentityDenial): CorporateIdentityResult => ({ ok: false, reason })

/**
 * Decide whether a verified Supabase identity is a corporate identity.
 *
 * PURE and FAIL-CLOSED: every branch that is not a positive match denies. It
 * makes no network call, reads no database, and has no dependency on request
 * state, so it is trivially testable and cannot be made to depend on anything
 * the caller controls beyond the verified user object itself.
 */
/**
 * The ADDRESS half of the rule: is this string shaped like a corporate mailbox?
 *
 * Extracted from `checkCorporateIdentity` (below) so the Controller's Login
 * screen can refuse `someone@gmail.com` BEFORE mailing a one-time code to it,
 * instead of letting the visitor finish a sign-in and only then meet
 * `/access-denied?reason=not_corporate`.
 *
 * 🔑 EXTRACTED, NEVER DUPLICATED. This module warns above that the rule "can be
 * silently weakened — or pointed at an attacker-controlled domain". A second
 * copy living in a React component is precisely that failure mode. There is one
 * implementation; `checkCorporateIdentity` calls it, and a test asserts the two
 * cannot return different verdicts for the same address.
 *
 * ⚠️ THIS ALONE IS NOT THE BOUNDARY. The address here is UNVERIFIED — anybody
 * can type `ceo@tappyai.com` into a form. What makes the boundary real is
 * `checkCorporateIdentity`, which also demands a CONFIRMED address on a real
 * session and runs server-side. Client-side use of this function is a courtesy
 * to the visitor, not a gate.
 */
export function checkCorporateEmailAddress(
  email: string | null | undefined
): CorporateIdentityResult {
  if (typeof email !== 'string' || email.length === 0) return deny('NO_EMAIL')

  if (hasControlOrSpace(email)) return deny('MALFORMED_EMAIL')

  // Exactly one '@'. Splitting on the last one alone would accept `a@b@evil.com`
  // shapes; requiring exactly one removes the ambiguity entirely.
  const at = email.indexOf('@')
  if (at < 0 || at !== email.lastIndexOf('@')) return deny('MALFORMED_EMAIL')

  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length === 0 || domain.length === 0) return deny('MALFORMED_EMAIL')

  // Charset FIRST, on the raw domain — see the note on ASCII_DOMAIN: checking
  // after normalisation would let a code point that folds into ASCII through.
  if (!ASCII_DOMAIN.test(domain)) return deny('MALFORMED_EMAIL')

  // `toLowerCase` (not `toLocaleLowerCase`) — locale-independent by spec, so a
  // Turkish locale cannot change the answer. By here the domain is known ASCII,
  // so this is a pure a-z fold with no Unicode behaviour left to reason about.
  const normalized = domain.toLowerCase()

  // EXACT equality, never `endsWith`. `endsWith('tappyai.com')` would accept
  // `evil@nottappyai.com`; `endsWith('.tappyai.com')` would accept an attacker
  // subdomain. A trailing dot (`tappyai.com.`) is likewise not equal, and so is
  // denied.
  if (normalized !== CORPORATE_EMAIL_DOMAIN) return deny('NON_CORPORATE_DOMAIN')

  return { ok: true, email, domain: normalized }
}

export function checkCorporateIdentity(
  user: VerifiedIdentity | null | undefined
): CorporateIdentityResult {
  if (!user) return deny('NO_IDENTITY')

  // Anonymous sign-ins are a consumer-app feature on this shared project. They
  // carry no email, so the NO_EMAIL branch would also catch them — this check
  // exists so the denial reason is accurate and so a future Supabase change that
  // gave anonymous users an address could not quietly reclassify them.
  if (user.is_anonymous === true) return deny('ANONYMOUS_IDENTITY')

  const email = user.email
  if (typeof email !== 'string' || email.length === 0) return deny('NO_EMAIL')

  // `email_confirmed_at` specifically — NOT `confirmed_at`. The latter is
  // Supabase's coalesce of email *and phone* confirmation, so a phone-confirmed
  // account with an unconfirmed `@tappyai.com` address would satisfy it. That
  // would let anyone who can type an address into signup claim a corporate
  // identity, which is the entire attack this boundary exists to stop.
  //
  // A pending `new_email` is deliberately ignored: only the currently confirmed
  // address counts, so an unconfirmed change request grants nothing.
  const confirmedAt = user.email_confirmed_at
  if (typeof confirmedAt !== 'string' || confirmedAt.length === 0) return deny('EMAIL_UNVERIFIED')

  // The address rule itself lives in ONE place — see `checkCorporateEmailAddress`
  // above. The identity-level checks (anonymous, present, CONFIRMED) stay here
  // and deliberately run FIRST: an unconfirmed address must never reach a
  // verdict that says "corporate".
  return checkCorporateEmailAddress(email)
}

/** Denial text for logs and the 403 envelope. Names the policy, leaks no state. */
export const CORPORATE_IDENTITY_DENIAL_MESSAGE =
  `Controller access requires a verified @${CORPORATE_EMAIL_DOMAIN} identity`
