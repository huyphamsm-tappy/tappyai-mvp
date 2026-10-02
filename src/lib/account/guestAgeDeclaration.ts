/**
 * GUEST AGE SELF-DECLARATION — the 18+ step for the trial, without an account.
 *
 * Owner decision D1 (revised, 2026-09-17): guests keep V3's trial (5 lifetime
 * chat questions) AND the age gate stays. A guest has no `user_demographics`
 * row to hold a date of birth, so the declaration lives ON THE DEVICE: a
 * cookie the web client sets through `POST /api/age-declaration`, or a header
 * an installed app sends with every chat request. Signed-in accounts never use
 * this path — theirs is `getAgeEligibility()` (main #251), unchanged.
 *
 * What it is: a self-declaration, like the birth-year gate on every age-rated
 * storefront. It is evaluated SERVER-SIDE on every request from the stored
 * value, never trusted as a boolean the client computed — a client that says
 * "2015-01-01" is refused however it labels itself.
 *
 * What it is not: identity. It never touches the database and never feeds
 * `ageBand` into the prompt context; a guest turn carries no demographic.
 *
 * Accepted values (the cookie and the header carry the same string):
 *   · `YYYY-MM-DD`  a date of birth — exact age
 *   · `YYYY`        a birth year   — age by year (the lightweight form)
 *   · `18plus`      an explicit "I am 18 or older" confirmation
 * Anything else is `unknown`, which withholds the model exactly like a missing
 * declaration.
 */
import { MINIMUM_AGE, parseDateOfBirthInput } from './ageEligibility'

export const GUEST_AGE_COOKIE = 'tappy_guest_age'
export const GUEST_AGE_HEADER = 'x-tappy-age-declared'
/** A declaration is remembered for a year; a guest who returns later is asked again. */
export const GUEST_AGE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60

export type GuestAgeStatus = 'eligible' | 'ineligible' | 'unknown'

export interface GuestAgeDeclaration {
  status: GuestAgeStatus
  /** The stored string, normalised, or null when nothing usable was declared. */
  value: string | null
}

const UNKNOWN: GuestAgeDeclaration = { status: 'unknown', value: null }

/** Whole years between an ISO date of birth and `now`, in UTC. */
function ageFromIsoDate(iso: string, now: Date): number {
  const [y, m, d] = iso.split('-').map(Number)
  let age = now.getUTCFullYear() - y
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

/**
 * Evaluate a declared value. Pure; `now` is injectable for tests.
 *
 * A birth YEAR alone cannot say whether the birthday has passed, so it is read
 * the way storefront gates read it: eligible when `now.year - year >= 18`.
 * A year in the future or more than 120 years back is nonsense, not a
 * declaration, and stays `unknown`.
 */
export function evaluateGuestAge(raw: unknown, now: Date = new Date()): GuestAgeDeclaration {
  if (typeof raw !== 'string') return UNKNOWN
  const value = raw.trim()
  if (value === '18plus') return { status: 'eligible', value }

  const iso = parseDateOfBirthInput(value)
  if (iso) {
    const age = ageFromIsoDate(iso, now)
    if (age < 0 || age > 120) return UNKNOWN
    return { status: age >= MINIMUM_AGE ? 'eligible' : 'ineligible', value: iso }
  }

  if (/^\d{4}$/.test(value)) {
    const year = Number(value)
    const age = now.getUTCFullYear() - year
    if (age < 0 || age > 120) return UNKNOWN
    return { status: age >= MINIMUM_AGE ? 'eligible' : 'ineligible', value }
  }
  return UNKNOWN
}

/** The `Cookie` header's value for `name`, or null. Tiny on purpose — no cookie library on the route. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== name) continue
    try { return decodeURIComponent(part.slice(eq + 1).trim()) } catch { return part.slice(eq + 1).trim() }
  }
  return null
}

/**
 * The declaration a request carries: the app header first (an installed app
 * has no cookie jar for this), then the web cookie. Evaluated fresh every call.
 */
export function readGuestAgeDeclaration(headers: Headers, now: Date = new Date()): GuestAgeDeclaration {
  const fromHeader = headers.get(GUEST_AGE_HEADER)
  if (fromHeader) return evaluateGuestAge(fromHeader, now)
  return evaluateGuestAge(readCookie(headers.get('cookie'), GUEST_AGE_COOKIE), now)
}

/** The `Set-Cookie` value that stores a declaration. HttpOnly: the client never needs to read it back. */
export function guestAgeCookie(value: string, secure: boolean): string {
  return `${GUEST_AGE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${GUEST_AGE_COOKIE_MAX_AGE_S}; SameSite=Lax; HttpOnly${secure ? '; Secure' : ''}`
}

/** Error code the chat route returns when a guest has not declared yet. */
export const GUEST_AGE_DECLARATION_REQUIRED = 'age_declaration_required' as const
