import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// 18+ eligibility — the consumer-side gate.
//
// Source of truth: `public.user_demographics.date_of_birth`, reachable ONLY
// through the SECURITY DEFINER function `public.user_age_status()`
// (20260908_user_demographics_foundation.sql §5a). No PostgREST role holds any
// privilege on the raw column, so this module cannot read a date of birth even
// if it tried — it reads a DERIVED status and nothing else.
//
// NOT `profiles`: that table is public-read and self-write, so an eligibility
// flag stored there would be readable by the anonymous internet and clearable
// by its own subject. Identical reasoning to `accountStatus.ts`; see the
// migration header for the measurement.
//
// ── THREE STATES, NOT TWO ────────────────────────────────────────────────────
//
//   eligible    — a date of birth is on file and it puts the user at or above
//                 MINIMUM_AGE. Proceed.
//   unknown     — no date of birth on file. The user is NOT under age; we have
//                 simply never asked. Product access is withheld until they
//                 answer, but nothing is recorded about them and no account is
//                 branded.
//   ineligible  — a date of birth is on file and it puts them below MINIMUM_AGE.
//                 Product access is refused.
//
// Collapsing `unknown` into `ineligible` would tell every pre-existing account
// that it is under age, which is false and unrecoverable-looking. Collapsing it
// into `eligible` would let the entire existing user base through ungated,
// which is the bypass this gate exists to close.
//
// ── WHY THIS FAILS CLOSED, WHERE `accountStatus.ts` FAILS OPEN ───────────────
//
// `getAccountRestriction` allows the request when its read fails, and says why:
// failing closed would take chat and posting from everyone during a database
// blip to close a window in which a sanctioned user — currently none — could
// act.
//
// The trade here is not the same one, so the answer is not the same either. A
// read failure that is treated as `eligible` admits every under-age visitor for
// the duration of the outage, and that is the single outcome this control
// exists to prevent. It therefore fails to `unknown` rather than to `eligible`:
// access is withheld and the user is routed to the age flow, which is the same
// path a genuinely-unasked user takes. It deliberately does NOT fail to
// `ineligible` — an outage must not record or imply that anyone is under age.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The age at or above which a user may use TappyAI.
 *
 * REQUIRES LEGAL REVIEW: no shipped Terms of Service or Privacy Policy in this
 * repository states a minimum age (`src/lib/i18n/legal.ts` enumerates the data
 * collected and lists neither age nor date of birth). This constant encodes the
 * product direction given for this task; it is not evidence of a legal
 * determination, and the legal texts must be updated before it ships.
 */
export const MINIMUM_AGE = 18

/** Age bands. Derived in SQL so Web and Android cannot disagree; mirrored here
 *  only as a type, never recomputed. */
export type AgeBand =
  | 'under_18' | '18_24' | '25_34' | '35_44' | '45_54' | '55_64' | '65_plus'

export type AgeEligibilityStatus = 'eligible' | 'unknown' | 'ineligible'

/** The shape `public.user_age_status()` returns. Never contains a date. */
export interface AgeStatusRow {
  has_dob: boolean | null
  age_years: number | null
  age_band: string | null
  corrections_used: number | null
}

export interface AgeEligibility {
  status: AgeEligibilityStatus
  /** Derived band, or null when unknown. A demographic signal, not an identifier. */
  ageBand: AgeBand | null
  /** Whole years. Server-side only — see `userDataClassification.ts` for where it may go. */
  age: number | null
  /** Whether the user still holds their single self-correction. */
  canSelfCorrect: boolean
}

const UNKNOWN: AgeEligibility = {
  status: 'unknown', ageBand: null, age: null, canSelfCorrect: true,
}

/** How many times a user may correct their own date of birth. */
export const MAX_SELF_CORRECTIONS = 1

/**
 * Pure decision. Separated from the query so the rules above are testable
 * without a database, and so a change to any of them fails loudly.
 */
export function evaluateAgeEligibility(
  row: AgeStatusRow | null | undefined
): AgeEligibility {
  if (!row || row.has_dob !== true) return UNKNOWN

  const age = typeof row.age_years === 'number' && Number.isFinite(row.age_years)
    ? row.age_years
    : null

  // `has_dob` true with no usable age means the function returned something this
  // code does not understand. That is a defect, not a licence to admit someone.
  if (age === null) return UNKNOWN

  const used = typeof row.corrections_used === 'number' ? row.corrections_used : 0
  const ageBand = (row.age_band as AgeBand | null) ?? null
  const status: AgeEligibilityStatus = age >= MINIMUM_AGE ? 'eligible' : 'ineligible'

  // F-028: an INELIGIBLE user may always self-correct — a mistyped date that reads as under-age
  // must not be a lockout. This mirrors set_user_date_of_birth(), which now refuses a correction
  // only while the user is currently eligible. An eligible user still gets exactly
  // MAX_SELF_CORRECTIONS (1); the general limit is unchanged.
  const canSelfCorrect = status === 'ineligible' ? true : used < MAX_SELF_CORRECTIONS

  return {
    status,
    ageBand,
    age,
    canSelfCorrect,
  }
}

/**
 * Reads the caller's own age eligibility.
 *
 * Never throws. On failure returns `unknown`, which withholds access and routes
 * to the age flow — see the fail-closed note above. The error is logged loudly
 * so the window is observable rather than silent.
 *
 * Takes the caller's own request-scoped client (cookie session for Web, verified
 * Bearer JWT for Android). `user_age_status()` keys on `auth.uid()` and takes no
 * user id, so one user cannot ask this question about another.
 */
export async function getAgeEligibility(
  supabase: SupabaseClient
): Promise<AgeEligibility> {
  try {
    const { data, error } = await supabase.rpc('user_age_status')

    if (error) {
      console.error('[ageEligibility] read failed, withholding access:', error.message)
      return UNKNOWN
    }

    // A `RETURNS TABLE` function arrives as an array of rows through PostgREST.
    const row = Array.isArray(data) ? (data[0] as AgeStatusRow | undefined) : (data as AgeStatusRow | null)
    return evaluateAgeEligibility(row ?? null)
  } catch (e) {
    console.error('[ageEligibility] read threw, withholding access:', e instanceof Error ? e.message : e)
    return UNKNOWN
  }
}

/** Status codes returned by `public.set_user_date_of_birth()`. */
export type DobWriteResult =
  | 'recorded' | 'corrected' | 'unchanged'
  | 'correction_exhausted' | 'invalid_date'
  | 'anonymous_not_eligible' | 'unauthenticated'

const DOB_WRITE_RESULTS: ReadonlySet<string> = new Set<DobWriteResult>([
  'recorded', 'corrected', 'unchanged',
  'correction_exhausted', 'invalid_date',
  'anonymous_not_eligible', 'unauthenticated',
])

/**
 * Records or corrects the caller's own date of birth.
 *
 * The one-self-correction rule is enforced inside the database function, not
 * here: every signed-in user holds their own access token and can call PostgREST
 * directly, so a rule that lived only in this file would be advisory.
 *
 * An unrecognised return value is treated as a failure rather than a success —
 * a future status code this build does not know about must not be read as
 * "written".
 */
export async function setDateOfBirth(
  supabase: SupabaseClient,
  isoDate: string
): Promise<{ ok: boolean; result: DobWriteResult }> {
  try {
    const { data, error } = await supabase.rpc('set_user_date_of_birth', { p_dob: isoDate })
    if (error) {
      console.error('[ageEligibility] dob write failed:', error.message)
      return { ok: false, result: 'invalid_date' }
    }
    const result = typeof data === 'string' && DOB_WRITE_RESULTS.has(data)
      ? (data as DobWriteResult)
      : null
    if (!result) {
      console.error('[ageEligibility] dob write returned an unrecognised status')
      return { ok: false, result: 'invalid_date' }
    }
    return { ok: result === 'recorded' || result === 'corrected' || result === 'unchanged', result }
  } catch (e) {
    console.error('[ageEligibility] dob write threw:', e instanceof Error ? e.message : e)
    return { ok: false, result: 'invalid_date' }
  }
}

/** The two machine codes this gate can return. A literal union, not `string`:
 *  `apiErrorContract`'s W2 rule refuses a computed `error` value unless it
 *  PROVABLY yields a snake_case code, and this type is that proof. */
export type AgeEligibilityCode = 'age_ineligible' | 'age_verification_required'

/** Stable machine-readable code, so clients localize rather than parse prose. */
export function ageEligibilityCode(status: AgeEligibilityStatus): AgeEligibilityCode {
  return status === 'ineligible' ? 'age_ineligible' : 'age_verification_required'
}

/**
 * Validates a client-supplied date of birth before it reaches the database.
 *
 * Accepts a plain `YYYY-MM-DD` calendar date and nothing else. A full timestamp
 * is refused rather than truncated: the truncation would depend on the server's
 * timezone, so the same instant could store two different dates and a user near
 * the boundary could be banded differently on Web than on Android.
 */
export function parseDateOfBirthInput(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null

  const [y, m, d] = trimmed.split('-').map(Number)
  // Round-trip through UTC so "2005-02-30" is rejected rather than rolled over
  // into March, which is what `new Date()` would silently do.
  const asUtc = new Date(Date.UTC(y, m - 1, d))
  if (
    asUtc.getUTCFullYear() !== y ||
    asUtc.getUTCMonth() !== m - 1 ||
    asUtc.getUTCDate() !== d
  ) return null

  if (y < 1900) return null
  // A future date is not a birth date. Compared in UTC against the server's
  // today; the database CHECK is the backstop.
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (asUtc.getTime() > todayUtc) return null

  return trimmed
}
