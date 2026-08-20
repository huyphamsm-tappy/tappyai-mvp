// Module 08 — the ADMINISTRATIVE side of `public.account_status`.
//
// Contract: docs/backoffice/10_User_Management.md §4, docs/backoffice/04 §7B,
// ADR-022. This is the counterpart to `src/lib/account/accountStatus.ts`, which
// is the CONSUMER side: that module reads the caller's own row through their
// user-scoped client; this one writes anybody's row through `service_role`.
//
// The two must never disagree about what a row MEANS, so the label shown to an
// admin is derived by calling the consumer module's `evaluateAccountStatus`
// rather than by re-reading the booleans here. If the enforcement rule changes
// — say an expired suspension stops counting as lifted — the Controller's badge
// changes with it, automatically.
//
// FOUR THINGS THIS FILE ENCODES
//
// 1. WRITES ARE UPSERTS, NEVER UPDATES. There is no backfill and no signup
//    trigger, so almost every user has no row at all (04 §7B "SAFETY"). An
//    UPDATE against an absent row affects zero rows and reports success — the
//    suspension would silently not happen. Insert-or-merge is the only correct
//    verb here.
//
// 2. A WRITE TOUCHES ONLY ITS OWN FIELDS. Suspending must not clear a ban and
//    unbanning must not clear a suspension: §4's state machine allows
//    `suspended → banned`, so a row legitimately carries both. Each transition
//    below names exactly the columns it owns; PostgREST's merge-duplicates
//    resolution leaves every column absent from the payload untouched on
//    conflict.
//
// 3. THE BEFORE-STATE IS READ, NOT ASSUMED. `13_Audit_Log.md` §3 wants
//    before/after on every entry, and "before" cannot be inferred from the
//    request — an admin suspending an already-suspended user is a different
//    event from a first suspension, and only the row can say which happened.
//
// 4. A BAN DOES NOT END A SESSION. §4 says a ban revokes every Supabase
//    session; that is an Auth Admin API operation against `auth.sessions`, not
//    a column. Until that half ships, a banned user keeps a valid session and
//    is stopped by consumer enforcement (blocked from posting, commenting and
//    AI) but is NOT stopped from logging in. `banSessionRevocationPending` is
//    returned on every ban so the caller reports the gap instead of implying a
//    completeness this module does not have.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateAccountStatus,
  type AccountStatusRow,
} from '@/lib/account/accountStatus'

/** Every column of `account_status`, as `service_role` sees it. */
export const ADMIN_ACCOUNT_STATUS_COLUMNS =
  'user_id, is_suspended, suspended_until, is_banned, ban_reason, created_at, updated_at'

export interface AdminAccountStatusRow extends AccountStatusRow {
  user_id: string
  ban_reason: string | null
  created_at: string | null
  updated_at: string | null
}

/** The three states of §4's machine that this module can represent. */
export type AccountStanding = 'active' | 'suspended' | 'banned'

/**
 * The standing an admin surface should display for a status row.
 *
 * Delegates to the consumer module so the Controller can never show "suspended"
 * for a user the app is letting post. `null` (no row) is ACTIVE — that is the
 * table's central convention, not a defensive default.
 */
export function standingOf(row: AccountStatusRow | null | undefined, now: Date = new Date()): AccountStanding {
  const restriction = evaluateAccountStatus(row, now)
  if (restriction.reason === 'banned') return 'banned'
  if (restriction.reason === 'suspended') return 'suspended'
  return 'active'
}

/**
 * True when the row is under an ACTIVE restriction of any kind.
 *
 * Used by the list filter to translate `status=active` into an exclusion set.
 * A row whose suspension has expired is not restricted, so it must not appear
 * in that set — otherwise a user the app treats as free would be filtered out
 * of the "active" list, and would show up under "suspended" instead.
 */
export function isRestricted(row: AccountStatusRow | null | undefined, now: Date = new Date()): boolean {
  return evaluateAccountStatus(row, now).blocked
}

/**
 * How many moderated users the `status=` list filter can resolve in memory.
 *
 * The filter cannot be pushed into the `profiles` query. `status=active` means
 * "no status row, OR a row whose restrictions do not currently apply", and an
 * embedded PostgREST filter is an INNER JOIN — it cannot express "no row", and
 * it cannot evaluate an expiry against `now()` either. So the moderated set is
 * read first and applied as an id list.
 *
 * That is sound while moderated users are a small minority of the platform, and
 * `account_status` holds a row only for someone an admin has acted on. The cap
 * is where the assumption stops being safe. Past it the filter FAILS rather
 * than degrades: a truncated exclusion set would show restricted accounts under
 * "active", which is precisely the answer a moderator must not be given
 * quietly. Reaching this cap is the signal to move the filter into a database
 * view, not to raise the number.
 */
export const STANDING_FILTER_CAP = 1000

export interface StandingFilter {
  /** `include` restricts the query to these ids; `exclude` removes them. */
  mode: 'include' | 'exclude'
  userIds: string[]
  /** False when the moderated set exceeded `STANDING_FILTER_CAP`. */
  complete: boolean
}

/**
 * Resolve `status=` into an id list against `profiles`.
 *
 * One query serves all three states: every row in `account_status` that carries
 * a flag is read once, then classified with the SAME evaluator the consumer
 * enforcement uses. This is what keeps an expired suspension out of the
 * `suspended` list and inside the `active` one, without duplicating the expiry
 * rule in a SQL predicate that could drift from it.
 */
export async function standingFilterIds(
  admin: SupabaseClient,
  standing: AccountStanding,
  now: Date = new Date()
): Promise<StandingFilter> {
  const { data, error } = await admin
    .from('account_status')
    .select('user_id, is_suspended, suspended_until, is_banned')
    .or('is_suspended.eq.true,is_banned.eq.true')
    .limit(STANDING_FILTER_CAP + 1)

  if (error) throw new Error(`account_status filter read failed: ${error.message}`)

  const rows = (data ?? []) as (AccountStatusRow & { user_id: string })[]
  const complete = rows.length <= STANDING_FILTER_CAP

  if (standing === 'active') {
    const restricted = rows.filter((r) => isRestricted(r, now)).map((r) => r.user_id)
    return { mode: 'exclude', userIds: restricted, complete }
  }

  const matching = rows.filter((r) => standingOf(r, now) === standing).map((r) => r.user_id)
  return { mode: 'include', userIds: matching, complete }
}

/** What changed, for the audit entry. Both halves are the FULL status shape. */
export interface StatusTransition {
  before: AdminAccountStatusRow | null
  after: AdminAccountStatusRow
}

/** The columns one transition owns. Anything absent is left as it was. */
type StatusPatch = Partial<Pick<AdminAccountStatusRow, 'is_suspended' | 'suspended_until' | 'is_banned' | 'ban_reason'>>

/**
 * Compute `suspended_until` for a suspension.
 *
 * `null` means INDEFINITE. `19_Security.md` §5 sketches `duration_hours` as
 * required, but §4 describes `suspended_until` as set "if time-limited", and
 * the consumer enforcement already handles a null expiry as an open-ended
 * block. Both readings are honoured: a duration produces an expiry, its absence
 * produces an indefinite suspension.
 */
export function suspensionExpiry(durationHours: number | undefined, now: Date = new Date()): string | null {
  if (durationHours === undefined) return null
  return new Date(now.getTime() + durationHours * 3_600_000).toISOString()
}

/**
 * Read one user's full status row. `null` when the user has never been
 * moderated — the caller must treat that as ACTIVE, not as an error.
 */
export async function readAccountStatus(
  admin: SupabaseClient,
  userId: string
): Promise<AdminAccountStatusRow | null> {
  const { data, error } = await admin
    .from('account_status')
    .select(ADMIN_ACCOUNT_STATUS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`account_status read failed: ${error.message}`)
  return (data as AdminAccountStatusRow | null) ?? null
}

/**
 * Read the status rows for a page of users, keyed by user id.
 *
 * Absent ids are absent from the map — the caller resolves them to ACTIVE. A
 * batched read rather than one query per row: the list surface would otherwise
 * issue up to 100 round trips per page.
 */
export async function readAccountStatusMany(
  admin: SupabaseClient,
  userIds: readonly string[]
): Promise<Map<string, AdminAccountStatusRow>> {
  const map = new Map<string, AdminAccountStatusRow>()
  if (userIds.length === 0) return map

  const { data, error } = await admin
    .from('account_status')
    .select(ADMIN_ACCOUNT_STATUS_COLUMNS)
    .in('user_id', userIds as string[])

  if (error) throw new Error(`account_status batch read failed: ${error.message}`)
  for (const row of (data ?? []) as AdminAccountStatusRow[]) map.set(row.user_id, row)
  return map
}

/**
 * Apply one transition and return before + after.
 *
 * The upsert is the whole mechanism — see note 1 in the header. `onConflict` is
 * named explicitly rather than left to inference: `user_id` is the primary key,
 * and stating it keeps the statement correct if a second unique index is ever
 * added to the table.
 */
async function applyPatch(
  admin: SupabaseClient,
  userId: string,
  patch: StatusPatch
): Promise<StatusTransition> {
  const before = await readAccountStatus(admin, userId)

  const { data, error } = await admin
    .from('account_status')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select(ADMIN_ACCOUNT_STATUS_COLUMNS)
    .single()

  if (error) throw new Error(`account_status write failed: ${error.message}`)
  return { before, after: data as AdminAccountStatusRow }
}

/**
 * Suspend. Owns `is_suspended` and `suspended_until` only.
 *
 * `is_banned` is deliberately not in the patch: suspending someone already
 * banned must not quietly unban them, and §4 permits a row to hold both.
 */
export function suspendUser(
  admin: SupabaseClient,
  userId: string,
  suspendedUntil: string | null
): Promise<StatusTransition> {
  return applyPatch(admin, userId, { is_suspended: true, suspended_until: suspendedUntil })
}

/**
 * Unsuspend. Clears the expiry along with the flag.
 *
 * Leaving a stale `suspended_until` behind would be harmless to enforcement
 * (which checks the flag first) but would make the row lie to anyone reading
 * it later, including the auto-unsuspend cron's index.
 */
export function unsuspendUser(admin: SupabaseClient, userId: string): Promise<StatusTransition> {
  return applyPatch(admin, userId, { is_suspended: false, suspended_until: null })
}

/**
 * Ban. Owns `is_banned` and `ban_reason` only.
 *
 * An existing suspension is left in place on purpose: `suspended → banned` is a
 * legal edge, and if the ban is later lifted the user should fall back to the
 * suspension they were already serving rather than to active.
 *
 * `ban_reason` is the internal moderation note. It is reachable only through
 * `service_role` — no PostgREST role holds a column grant on it, not even the
 * subject of the note (04 §7B section 3).
 */
export function banUser(admin: SupabaseClient, userId: string, reason: string): Promise<StatusTransition> {
  return applyPatch(admin, userId, { is_banned: true, ban_reason: reason })
}

/** Unban. Clears the flag and the internal note it justified. */
export function unbanUser(admin: SupabaseClient, userId: string): Promise<StatusTransition> {
  return applyPatch(admin, userId, { is_banned: false, ban_reason: null })
}

/**
 * ⚠️ Session revocation on ban is NOT implemented — see note 4 in the header.
 *
 * Exported as a constant rather than left as a comment so the ban route returns
 * it to the caller and the gap is visible in the API response, not only to
 * someone reading this file.
 */
export const BAN_SESSION_REVOCATION_PENDING = true
