import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Module 08 — consumer-side account status enforcement.
//
// Contract: docs/backoffice/10_User_Management.md §4.
//   suspended → cannot post, cannot comment, cannot use AI; can browse read-only.
//   banned    → cannot log in. Session revocation is an Auth Admin API operation;
//               this module does not and cannot revoke a session.
//
// Source of truth: `public.account_status` (04 §7B, ADR-022). NOT `profiles` —
// that table is public-read and self-write, so a status flag stored there would
// be readable by the anonymous internet and clearable by its own subject.
//
// TWO RULES THIS FILE EXISTS TO ENCODE
//
// 1. ABSENT ROW MEANS ACTIVE. There is no backfill and no signup trigger, so
//    almost every user has no row at all. `maybeSingle()` + a null-is-active
//    default is the whole mechanism; an inner join or a `.single()` would turn
//    every never-moderated user into an error.
//
// 2. AN EXPIRED SUSPENSION IS NOT A SUSPENSION. §4 says the suspension ends when
//    `suspended_until` passes ("Cron job: auto-unsuspend when suspended_until
//    passes"). Enforcement therefore checks the timestamp rather than trusting
//    the boolean. The cron tidies the flag; it is not what makes the user free
//    again, so cron latency or a cron outage cannot over-punish anyone.
//
// The read uses the caller's own user-scoped client. `authenticated` holds a
// column-list GRANT covering exactly the four non-sensitive columns and an
// own-row RLS policy, so this query is all a signed-in user is permitted to see.
// It must never select `*` or `ban_reason` — both are denied with 42501, by
// design, including to the subject of the note.
// ─────────────────────────────────────────────────────────────────────────────

// 🚨 R-4 (2026-09-24): 'unavailable' IS A THIRD ANSWER, NOT A THIRD PUNISHMENT.
// "we know you are blocked" and "we could not find out" are different facts and the user must
// be told different things. Collapsing them was the old fail-OPEN ("could not find out" → let
// them through); collapsing them the other way would be worse, telling an innocent user their
// account is suspended because a read timed out. This reason means: refuse the action, say the
// check is temporarily unavailable, invite a retry, and accuse nobody.
export type AccountRestrictionReason = 'suspended' | 'banned' | 'unavailable'

export interface AccountRestriction {
  blocked: boolean
  reason: AccountRestrictionReason | null
  /** When a time-limited suspension lifts. Null = indefinite, or not suspended. */
  suspendedUntil: string | null
}

/** The columns `authenticated` is granted. Selecting anything else is denied. */
export const ACCOUNT_STATUS_COLUMNS = 'is_suspended, suspended_until, is_banned'

export interface AccountStatusRow {
  is_suspended: boolean | null
  suspended_until: string | null
  is_banned: boolean | null
}

const ACTIVE: AccountRestriction = { blocked: false, reason: null, suspendedUntil: null }

/**
 * Pure decision. Separated from the query so the rules above are testable
 * without a database, and so a change to either rule fails loudly.
 */
export function evaluateAccountStatus(
  row: AccountStatusRow | null | undefined,
  now: Date = new Date()
): AccountRestriction {
  if (!row) return ACTIVE

  // Ban outranks suspension: the state machine (§4) allows suspended → banned,
  // so a row can carry both, and the stricter state is the one that applies.
  if (row.is_banned === true) {
    return { blocked: true, reason: 'banned', suspendedUntil: null }
  }

  if (row.is_suspended === true) {
    const until = row.suspended_until
    if (!until) return { blocked: true, reason: 'suspended', suspendedUntil: null }

    const expiresAt = new Date(until)
    // An unparseable timestamp must not silently free a suspended account.
    if (Number.isNaN(expiresAt.getTime())) {
      return { blocked: true, reason: 'suspended', suspendedUntil: until }
    }
    if (expiresAt > now) {
      return { blocked: true, reason: 'suspended', suspendedUntil: until }
    }
    // Expired — §4's auto-unsuspend, applied at read time.
    return ACTIVE
  }

  return ACTIVE
}

/** Refusal because the status could not be read — never because of anything the user did. */
const UNAVAILABLE: AccountRestriction = { blocked: true, reason: 'unavailable', suspendedUntil: null }

/**
 * Reads the caller's own account status. Never throws.
 *
 * ── R-4: THIS NOW FAILS CLOSED, AND THE COST WAS WEIGHED RATHER THAN ASSUMED ──
 *
 * It used to return ACTIVE when the read failed, with the trade recorded as "failing closed
 * would take posting, commenting and chat away from every user during any database blip, to
 * close a window in which a sanctioned user — currently zero of them — could act".
 *
 * The reasoning was sound about cost and wrong about shape. An enforcement control that stops
 * enforcing precisely when the database is unhealthy is enforcement an attacker can schedule:
 * a suspended account only has to retry during the blip. And "currently zero" is a fact about
 * today, not a property of the system — the first real suspension makes it stale, and nothing
 * here would have told us.
 *
 * What made fail-closed unacceptable before was not the refusal, it was the MESSAGE: a real user
 * being told they are suspended because a read timed out. That is why the failure now has its
 * own reason. The user is told the check is temporarily unavailable and to try again; they are
 * never told they are blocked, and no moderation state is implied.
 *
 * One retry first. Most of these failures are a single dropped pooler connection, and retrying
 * once turns the common case back into a normal answer instead of a refusal the user sees.
 */
export async function getAccountRestriction(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<AccountRestriction> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from('account_status')
        .select(ACCOUNT_STATUS_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle()

      if (!error) return evaluateAccountStatus(data as AccountStatusRow | null, now)
      if (attempt === 1) {
        console.error('[accountStatus] read failed twice, refusing the action:', error.message)
        return UNAVAILABLE
      }
    } catch (e) {
      if (attempt === 1) {
        console.error('[accountStatus] read threw twice, refusing the action:', e instanceof Error ? e.message : e)
        return UNAVAILABLE
      }
    }
  }
  return UNAVAILABLE
}

/** Stable machine-readable code, so clients localize rather than parse prose. */
export function accountRestrictionCode(reason: AccountRestrictionReason): string {
  if (reason === 'banned') return 'account_banned'
  // Its own code so a client can offer "try again" instead of an appeals link.
  if (reason === 'unavailable') return 'account_status_unavailable'
  return 'account_suspended'
}

/** 503 for an unreadable status — a retryable server condition, not a 403 verdict on the user. */
export function accountRestrictionStatus(reason: AccountRestrictionReason): 403 | 503 {
  return reason === 'unavailable' ? 503 : 403
}

/**
 * User-facing message. Vietnamese, matching the convention of the routes this
 * guards; the `code` above is what a client should branch on.
 */
export function accountRestrictionMessage(restriction: AccountRestriction): string {
  // 🚨 Says nothing about the account. The check failed; the user did not.
  if (restriction.reason === 'unavailable') {
    return 'Hiện chưa kiểm tra được trạng thái tài khoản. Bạn thử lại sau ít phút nhé.'
  }
  if (restriction.reason === 'banned') {
    return 'Tài khoản của bạn đã bị khóa vĩnh viễn.'
  }
  if (restriction.suspendedUntil) {
    const until = new Date(restriction.suspendedUntil)
    if (!Number.isNaN(until.getTime())) {
      const when = until.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      return `Tài khoản của bạn đang bị tạm khóa đến ngày ${when}. Bạn vẫn có thể xem nội dung.`
    }
  }
  return 'Tài khoản của bạn đang bị tạm khóa. Bạn vẫn có thể xem nội dung.'
}
