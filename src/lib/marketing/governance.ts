// ─── V2.2-2 MARKETING — THE GOVERNANCE ENGINE ────────────────────────────────
//
// Contract: docs/controller-v2/V2.2_MARKETING_PHASE2_CONTRACT.md
//   §2 consent · §5 frequency · §6 quiet hours · §7 unsubscribe · §8.1 floor
//   M-1, M-6, M-6a, M-6b, M-6c, M-7, M-8, M-9, M-9a, M-9b, M-10, M-11,
//   M-12a, M-12b, M-12c, M-31, M-31a
//
// 🚨 EVERY FUNCTION IN THIS FILE IS PURE. It receives already-fetched state and
// returns a decision. That is deliberate: `27` §4 requires these rules to be
// "enforced server-side at dispatch time", and a rule that can only be tested
// against a live database is a rule whose removal a test suite will not notice.
// Mutation testing is the acceptance criterion for this file (DoD 7), and it
// only works if each rule can be deleted and observed to fail.
//
// 🚨 WHAT THIS FILE DOES NOT DO. It sends nothing, reads no database, and
// authorizes nobody. It cannot enable a campaign; the activation route decides
// that and remains blocked while M-30 is UNSATISFIED and Q6 is OPEN.

/** The channels consent is keyed by (M-3). Phase 2 SENDS only `push`. */
export const MARKETING_CHANNELS = ['push', 'email', 'in_app'] as const
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number]

/**
 * The reserved row that is not a channel: `channel = 'global'` with
 * `opted_in = false` is the global unsubscribe of M-10.
 */
export const GLOBAL_CONSENT_CHANNEL = 'global' as const
export type ConsentChannel = MarketingChannel | typeof GLOBAL_CONSENT_CHANNEL

/** One row of `marketing_consent`, as stored. */
export interface ConsentRow {
  channel: ConsentChannel
  opted_in: boolean
}

/**
 * Why a recipient was not sent to. Reported as COUNTS ONLY (M-9b, M-31a) —
 * never attached to a user id, an endpoint or an email.
 */
export type SkipReason =
  | 'consent'
  | 'unsubscribed'
  | 'frequency_24h'
  | 'frequency_7d'
  | 'quiet_hours'
  | 'ineligible'

export type RecipientDecision = { send: true } | { send: false; reason: SkipReason }

export interface SkipCounts {
  consent: number
  unsubscribed: number
  frequency_24h: number
  frequency_7d: number
  quiet_hours: number
  ineligible: number
}

export function emptySkipCounts(): SkipCounts {
  return {
    consent: 0,
    unsubscribed: 0,
    frequency_24h: 0,
    frequency_7d: 0,
    quiet_hours: 0,
    ineligible: 0,
  }
}

// ─── §7 — GLOBAL UNSUBSCRIBE (M-10, M-11) ────────────────────────────────────

/**
 * Has this user globally unsubscribed?
 *
 * TRUE only when a `global` row exists AND says `opted_in = false`. A missing
 * global row is NOT an unsubscribe — it is the ordinary state of someone who
 * has never used the control.
 *
 * 🔑 M-11: this is consulted only on the marketing path. Transactional
 * categories never reach this function, because `33` §5 says auth, security and
 * transactional events are not opt-out. A global unsubscribe must not be able
 * to switch off a password-reset notification.
 */
export function isGloballyUnsubscribed(rows: readonly ConsentRow[]): boolean {
  const global = rows.find((r) => r.channel === GLOBAL_CONSENT_CHANNEL)
  return global !== undefined && global.opted_in === false
}

// ─── §2 — CONSENT (M-1) ──────────────────────────────────────────────────────

/**
 * Does this user consent to marketing on this channel?
 *
 * 🚨 ABSENCE IS OPTED OUT. This is the single most important line in the file
 * and the easiest to "simplify" into its opposite. `rows.find(...)?.opted_in`
 * yields `undefined` for a user who has never acted, and `undefined` is falsy,
 * so the strict `=== true` below is doing real work rather than being
 * defensive: it makes "no row" and "row saying no" the same answer, which is
 * exactly what opt-in means.
 *
 * Owner decision 2026-09-01: every user who exists on the day this ships is
 * opted OUT until they act. There is no backfill, and a migration that added
 * one would invert a legal posture with a single UPDATE.
 */
export function hasChannelConsent(
  rows: readonly ConsentRow[],
  channel: MarketingChannel,
): boolean {
  const row = rows.find((r) => r.channel === channel)
  return row?.opted_in === true
}

// ─── §6 — QUIET HOURS (M-8, M-9) ─────────────────────────────────────────────

/** Quiet hours begin at 22:00 VN time (`27` §4). */
export const QUIET_HOURS_START = 22
/** Quiet hours end at 07:00 VN time — 07:00 itself is ALLOWED. */
export const QUIET_HOURS_END = 7
/** `27` §4 says "VN time". Named, not offset-encoded — see `vietnamHour`. */
export const QUIET_HOURS_TZ = 'Asia/Ho_Chi_Minh'

/**
 * The hour of day in Vietnam, 0–23.
 *
 * 🔑 RESOLVED THROUGH `Intl`, NOT BY ADDING 7. Vietnam has had no DST since
 * 1975, so `UTC+7` happens to be correct today — but writing the offset into
 * the code makes the rule depend on a fact about politics rather than on the
 * timezone database, and the failure mode is silent: pushes at 03:00 local for
 * a year before anyone notices. `hour12: false` matters too, or midnight
 * formats as "24" in some locales.
 */
export function vietnamHour(now: Date): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: QUIET_HOURS_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(now)
  // Some ICU builds render midnight as "24" under hour12:false.
  return Number(hour) % 24
}

/**
 * Is `now` inside quiet hours?
 *
 * The window WRAPS MIDNIGHT, so it is a disjunction rather than a range check:
 * 22:00–23:59 and 00:00–06:59 are both quiet. A naive `start <= h && h < end`
 * would be empty for every hour of every day and the rule would silently never
 * fire.
 *
 * Boundaries, and they are the whole failure mode (DoD 5):
 *   21:59 → sends · 22:00 → blocked · 06:59 → blocked · 07:00 → sends
 */
export function isQuietHours(now: Date): boolean {
  const h = vietnamHour(now)
  return h >= QUIET_HOURS_START || h < QUIET_HOURS_END
}

// ─── §5 — ROLLING FREQUENCY CAPS (M-6, M-6a, M-6b, M-6c) ─────────────────────

/** `27` §4: 1 marketing push per user per rolling 24 hours (Owner: rolling). */
export const CAP_24H = 1
export const WINDOW_24H_MS = 24 * 60 * 60 * 1000
/** `27` §4: 4 marketing pushes per user per rolling 7 days. */
export const CAP_7D = 4
export const WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How many of these sends fall inside a window ending now.
 *
 * ROLLING, MEASURED BACKWARDS FROM THE MOMENT OF DISPATCH (M-6a) — not from a
 * calendar boundary and not from a campaign start time. Calendar semantics
 * would permit two sends 60 seconds apart across midnight while both "obey"
 * 1/day, which is the harm the cap exists to prevent.
 *
 * The comparison is STRICTLY LESS THAN the window, so a send exactly 24h old
 * has left the window. DoD 4 pins both sides: T+23h59m is still counted
 * (blocked), T+24h01m is not (allowed).
 *
 * Future-dated rows (clock skew, a bad fixture) are counted rather than
 * ignored: `age` is negative, `negative < window` is true. Counting them is the
 * conservative direction — it can only refuse a send, never permit an extra one.
 */
export function countWithinWindow(
  sentAt: readonly Date[],
  now: Date,
  windowMs: number,
): number {
  const end = now.getTime()
  return sentAt.filter((t) => end - t.getTime() < windowMs).length
}

/**
 * Which cap, if any, this recipient's history breaches.
 *
 * BOTH WINDOWS ARE ENFORCED INDEPENDENTLY AND THE STRICTER ONE WINS (M-6b): a
 * recipient with 4 sends in 7 days is refused even when none is inside 24h, and
 * a recipient with 1 send inside 24h is refused even when their weekly total is
 * 1. Returning the 24h reason first when both breach is an ATTRIBUTION choice,
 * not a safety one — either way the send is refused.
 */
export function frequencyBreach(
  sentAt: readonly Date[],
  now: Date,
): 'frequency_24h' | 'frequency_7d' | null {
  if (countWithinWindow(sentAt, now, WINDOW_24H_MS) >= CAP_24H) return 'frequency_24h'
  if (countWithinWindow(sentAt, now, WINDOW_7D_MS) >= CAP_7D) return 'frequency_7d'
  return null
}

// ─── THE PER-RECIPIENT DECISION ──────────────────────────────────────────────

export interface RecipientState {
  /** This user's `marketing_consent` rows. EMPTY MEANS OPTED OUT. */
  consent: readonly ConsentRow[]
  /** `created_at` of this user's `status='sent'` marketing deliveries (M-6c). */
  sentAt: readonly Date[]
  /**
   * Account-level eligibility, decided upstream by the audience builder
   * (banned / suspended / no profile). False ⇒ `ineligible`.
   */
  eligible: boolean
}

/**
 * Should this recipient receive this marketing message?
 *
 * PRECEDENCE, and it is an attribution decision rather than a safety one —
 * every branch below refuses:
 *
 *   1. ineligible      — not a member account we may message at all
 *   2. unsubscribed    — the global "stop everything" (M-10 overrides consent)
 *   3. consent         — never opted in on this channel (M-1)
 *   4. quiet_hours     — 22:00–07:00 VN (M-8); DROPPED, never deferred (§6.1)
 *   5. frequency_*     — rolling 24h / 7d (M-6b)
 *
 * The order runs from "we may not message this person at all" to "not right
 * now", so the reported reason is the most fundamental one that applies. An
 * operator reading "17 skipped by quiet hours" for people who had also never
 * consented would draw the wrong conclusion about their audience.
 *
 * 🚨 THERE IS NO `force`, NO `bypass`, AND NO CALLER-SUPPLIED CATEGORY here.
 * The category is structural (M-5): this function is only ever reached on the
 * marketing path, and transactional notifications never call it.
 */
export function decideRecipient(state: RecipientState, now: Date): RecipientDecision {
  if (!state.eligible) return { send: false, reason: 'ineligible' }
  if (isGloballyUnsubscribed(state.consent)) return { send: false, reason: 'unsubscribed' }
  if (!hasChannelConsent(state.consent, 'push')) return { send: false, reason: 'consent' }
  if (isQuietHours(now)) return { send: false, reason: 'quiet_hours' }

  const breach = frequencyBreach(state.sentAt, now)
  if (breach) return { send: false, reason: breach }

  return { send: true }
}

// ─── §8.1 — THE PRIVACY FLOOR (M-12a, M-12b, M-12c, M-31) ────────────────────

/**
 * Minimum audience: 10 DISTINCT ELIGIBLE users.
 *
 * OWNER DECISION 2026-09-01, and deliberately not derived from any existing
 * document — no k-anonymity threshold exists anywhere in this repository. It
 * must not be relabelled as a doc requirement later.
 */
export const MIN_AUDIENCE = 10

export type FloorVerdict = { ok: true } | { ok: false; reason: 'BELOW_MINIMUM_AUDIENCE' }

/**
 * Does this audience clear the floor?
 *
 * 🚨 THE VERDICT CARRIES NO NUMBER, AND THAT IS THE POINT (M-12c). "Audience is
 * 2, minimum is 10" is a query oracle: an operator could binary-search a
 * predicate down to a single identifiable person by reading the shortfall back
 * from successive refusals. The refusal says the floor was not met and nothing
 * more — no size, no distance, no hint.
 *
 * The count passed in must be the audience AFTER consent, unsubscribe and
 * eligibility filtering (M-12b). A filter matching 400 people of whom 3 have
 * consented is an audience of 3, and refusing it is the entire purpose.
 */
export function checkAudienceFloor(eligibleCount: number): FloorVerdict {
  return eligibleCount >= MIN_AUDIENCE ? { ok: true } : { ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' }
}
