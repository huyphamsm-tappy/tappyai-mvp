import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateAccountStatus,
  ACCOUNT_STATUS_COLUMNS,
  type AccountStatusRow,
} from '@/lib/account/accountStatus'

// ─── PHASE C — THE BROADCAST AUDIENCE BUILDER ────────────────────────────────
//
// Contract: docs/controller-v2/V2.2_PHASE_C_BROADCAST_CONTRACT.md §2, C-21,
// C-31, C-32.
//
// 🚨 WHY THIS IS A SEPARATE PRIMITIVE AND NOT A CHANGE TO
// `getAllSubscribedUserIds()`. That function is NOT dead code: it is called by
// `/api/cron/deal-notifications`, which IS registered in `vercel.json` and runs
// daily at 00:30 UTC. Editing it to serve broadcast would silently redefine a
// live job that notifies every subscribed user about deals. Phase C therefore
// builds its own audience and leaves that function untouched (C-21).
//
// ── THE AUDIENCE, PER O-1 = B AND O-2 = A ────────────────────────────────────
// Enabled webpush subscriptions belonging to active, eligible, non-anonymous
// accounts — materialised once, in a deterministic order.
//
// A person outside this set receives NOTHING: no push and no inbox row. The
// audience is the only gate, which is why `emitNotification` is not modified
// (C-30): broadcast simply never calls it for a non-member.

/**
 * TWO JOINS, TWO DIFFERENT KINDS, FOR TWO DIFFERENT REASONS.
 *
 * 🚨 This is the part that looks like an inconsistency and is not. Applying one
 * rule to both would break one of them:
 *
 *   · `profiles` — INNER (membership). A row must EXIST. Absence means the
 *     subscription belongs to something that is not a member account.
 *   · `account_status` — LEFT (eligibility). A row need NOT exist, and its
 *     absence means ACTIVE.
 *
 * Reversing either is a silent, plausible-looking bug:
 *   · an INNER join on `account_status` excludes almost the entire audience,
 *     because the table has no backfill and no signup trigger — a row appears
 *     only when an administrator acts. The broadcast would report success and
 *     reach nobody.
 *   · a LEFT join on `profiles` admits accounts with no profile at all.
 */
export interface AudienceExclusionCounts {
  /** Banned accounts. Excluded entirely (O-2 = A). */
  banned: number
  /** Accounts under an EFFECTIVE suspension — see `evaluateAccountStatus`. */
  suspended: number
  /**
   * Subscriptions whose user has no `profiles` row.
   *
   * Since `20260808c_handle_new_user_skip_anonymous.sql` the profile trigger
   * skips anonymous signups, so "no profile" is how an anonymous session shows
   * up here, and excluding it is C-2.
   *
   * ⚠️ HONEST LIMIT, stated rather than implied: that migration created no
   * profiles and deleted none ("Profiles that already exist are untouched"), so
   * an anonymous account created BEFORE 2026-08-08 may still hold a profiles
   * row and would not be caught by this check. `auth.users.is_anonymous` is the
   * authoritative signal and PostgREST does not expose the `auth` schema, so
   * reading it per candidate is a GoTrue Admin API round trip each. Closing
   * that residual gap properly means a `SECURITY DEFINER` function — the
   * pattern `fn_session_revoke_all` already uses — which is a migration and a
   * separate decision. It is NOT closed here, and must not be described as if
   * it were.
   */
  noProfile: number
}

export interface BroadcastAudience {
  /** Ordered, de-duplicated, eligible. The send list. */
  recipients: string[]
  /** Distinct users holding an enabled subscription, before eligibility. */
  candidates: number
  excluded: AudienceExclusionCounts
}

/**
 * THE ELIGIBILITY DECISION, as a pure function.
 *
 * Separated from the queries so every rule above can be asserted without a
 * database, and so a mutation to any one of them fails a test rather than
 * changing an audience silently. `candidates` arrives already ordered and
 * de-duplicated; this preserves that order exactly (C-24).
 */
export function selectEligibleRecipients(
  candidates: readonly string[],
  profileIds: ReadonlySet<string>,
  statusByUser: ReadonlyMap<string, AccountStatusRow>,
  now: Date = new Date(),
): { recipients: string[]; excluded: AudienceExclusionCounts } {
  const recipients: string[] = []
  const excluded: AudienceExclusionCounts = { banned: 0, suspended: 0, noProfile: 0 }

  for (const userId of candidates) {
    if (!profileIds.has(userId)) {
      excluded.noProfile++
      continue
    }

    // 🔑 ONE DEFINITION OF "SUSPENDED", NOT TWO. `evaluateAccountStatus` is the
    // same function the consumer-side guard uses, so an expired suspension is
    // treated as expired HERE for exactly the reason it is there: §4's
    // auto-unsuspend is a cron, and cron latency must not over-punish anyone.
    // Reading `is_suspended` directly would turn a lapsed 7-day suspension into
    // permanent exclusion from every broadcast — invisibly, because the person
    // simply stops receiving things.
    //
    // A user with NO status row reaches this with `undefined`, and
    // `evaluateAccountStatus` returns ACTIVE for it. That is the LEFT join.
    const restriction = evaluateAccountStatus(statusByUser.get(userId) ?? null, now)
    if (restriction.blocked) {
      if (restriction.reason === 'banned') excluded.banned++
      else excluded.suspended++
      continue
    }

    recipients.push(userId)
  }

  return { recipients, excluded }
}

/** Column list for the status read. `user_id` is needed to key the map. */
const STATUS_SELECT = `user_id, ${ACCOUNT_STATUS_COLUMNS}`

/**
 * Build the broadcast audience.
 *
 * ORDERING IS PART OF THE CONTRACT, NOT A CONVENIENCE (C-24). The `.order()`
 * below is applied IN THE QUERY. Without it PostgreSQL may return rows in any
 * order — and it changes in practice, after an update, a vacuum, or a plan
 * change from seq-scan to index-scan. `new Set` then preserves whatever arrival
 * order it was handed. A chunked campaign that resumes against a different
 * order notifies some people twice and others never, so the ordering is what
 * makes chunk boundaries mean anything at all.
 *
 * Throws on a query failure rather than returning a partial audience: a
 * broadcast that silently reached half the platform because a lookup failed is
 * worse than one that did not run.
 */
export async function buildBroadcastAudience(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<BroadcastAudience> {
  const { data: subs, error: subsErr } = await admin
    .from('notification_subscriptions')
    .select('user_id')
    .eq('enabled', true)
    .order('user_id', { ascending: true })

  if (subsErr) throw new Error(`broadcast audience: subscription read failed: ${subsErr.message}`)

  // De-duplicate by USER, never by credential. Safe only because of I1 — at most
  // one enabled row per credential — so visiting each user once visits each
  // credential at most once. Relaxing I1 turns this into a per-device fan-out
  // with cross-account delivery; that is what test T-30 exists to catch.
  const candidates = [...new Set((subs ?? []).map((r) => r.user_id as string))]
  if (candidates.length === 0) {
    return { recipients: [], candidates: 0, excluded: { banned: 0, suspended: 0, noProfile: 0 } }
  }

  const [{ data: profiles, error: profErr }, { data: statuses, error: statusErr }] =
    await Promise.all([
      admin.from('profiles').select('id').in('id', candidates),
      admin.from('account_status').select(STATUS_SELECT).in('user_id', candidates),
    ])

  if (profErr) throw new Error(`broadcast audience: profile read failed: ${profErr.message}`)
  if (statusErr) throw new Error(`broadcast audience: status read failed: ${statusErr.message}`)

  const profileIds = new Set((profiles ?? []).map((r) => r.id as string))
  const statusByUser = new Map<string, AccountStatusRow>(
    (statuses ?? []).map((r) => [
      (r as { user_id: string }).user_id,
      r as unknown as AccountStatusRow,
    ]),
  )

  const { recipients, excluded } = selectEligibleRecipients(candidates, profileIds, statusByUser, now)
  return { recipients, candidates: candidates.length, excluded }
}
