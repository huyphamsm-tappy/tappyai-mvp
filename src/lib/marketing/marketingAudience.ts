import type { SupabaseClient } from '@supabase/supabase-js'
import {
  evaluateAccountStatus,
  ACCOUNT_STATUS_COLUMNS,
  type AccountStatusRow,
} from '@/lib/account/accountStatus'
import {
  decideRecipient,
  emptySkipCounts,
  type ConsentRow,
  type SkipCounts,
} from './governance'
import { readConsentForUsers } from './consentStore'
import { readRecentSends } from './deliveryLedger'

// ─── V2.2-2 — THE MARKETING AUDIENCE BUILDER ─────────────────────────────────
//
// Contract: M-12b (the audience is what remains AFTER governance) · M-13 (its
// own builder) · M-9b / M-31a (skips are counts, never identities) · M-20
// (governance is applied BEFORE recipients reach the dispatch seam).
//
// 🚨 THIS FILE DOES NOT MODIFY `broadcastAudience.ts`, AND MUST NOT.
// C-21 established the rule when Phase C left the deal cron's
// `getAllSubscribedUserIds()` alone: an audience function with a live caller is
// not a place to add a second caller's rules. Marketing gets its own builder
// and IMPORTS the shared eligibility decision rather than copying or editing
// it, so "which accounts may be messaged at all" has exactly one definition.
//
// 🔑 THE ORDER OF THE TWO LAYERS IS THE WHOLE DESIGN.
//
//   layer 1  ACCOUNT ELIGIBILITY — may we message this account at all?
//            profile INNER (membership) · account_status LEFT (absence =
//            active) · effective suspension. Identical to Phase C.
//
//   layer 2  MARKETING GOVERNANCE — may we send THIS message NOW?
//            consent · global unsubscribe · quiet hours · rolling caps.
//
// Reversing them would ask "has this banned account consented?" — answerable,
// and meaningless. More importantly, M-12b requires the audience the privacy
// floor is measured against to be what survives BOTH layers: a filter matching
// 400 people of whom 3 consented is an audience of 3, and refusing it is the
// entire point of the floor.

export interface MarketingAudience {
  /** Ordered, de-duplicated, and cleared by every rule. The send list. */
  recipients: string[]
  /** Distinct users holding an enabled subscription, before any filtering. */
  candidates: number
  /**
   * Why the others were dropped. COUNTS ONLY (M-9b, M-31a) — no user id, no
   * endpoint, no email ever appears here or anywhere downstream of it.
   */
  skipped: SkipCounts
  /**
   * Everyone the campaign considered and refused, so the caller can record a
   * `skipped` delivery row per person (M-7). This is the ONE place recipient
   * identity travels with a reason, it never leaves the server, and it is
   * written only to `notification_deliveries` — never to an audit row, an API
   * response or a log.
   */
  refusals: { userId: string; reason: keyof SkipCounts }[]
}

const STATUS_SELECT = `user_id, ${ACCOUNT_STATUS_COLUMNS}`

/**
 * Build the marketing audience.
 *
 * ORDERING IS PART OF THE CONTRACT, exactly as it is for Phase C: the `.order()`
 * is applied IN THE QUERY, because PostgreSQL may otherwise return rows in any
 * order and it changes in practice after an update or a plan change. A chunked
 * campaign that resumes against a different order notifies some people twice
 * and others never.
 *
 * Throws on a query failure rather than returning a partial audience. A
 * campaign that silently reached half the eligible population because a lookup
 * failed is worse than one that did not run.
 */
export async function buildMarketingAudience(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<MarketingAudience> {
  const { data: subs, error: subsErr } = await admin
    .from('notification_subscriptions')
    .select('user_id')
    .eq('enabled', true)
    .order('user_id', { ascending: true })

  if (subsErr) throw new Error(`marketing audience: subscription read failed: ${subsErr.message}`)

  // De-duplicate by USER, never by credential — safe only because of I1 (at
  // most one enabled row per credential), the same dependency Phase C carries.
  const candidates = [...new Set((subs ?? []).map((r) => r.user_id as string))]
  if (candidates.length === 0) {
    return { recipients: [], candidates: 0, skipped: emptySkipCounts(), refusals: [] }
  }

  const [
    { data: profiles, error: profErr },
    { data: statuses, error: statusErr },
    consentByUser,
    sendsByUser,
  ] = await Promise.all([
    admin.from('profiles').select('id').in('id', candidates),
    admin.from('account_status').select(STATUS_SELECT).in('user_id', candidates),
    readConsentForUsers(admin, candidates),
    readRecentSends(admin, candidates, now),
  ])

  if (profErr) throw new Error(`marketing audience: profile read failed: ${profErr.message}`)
  if (statusErr) throw new Error(`marketing audience: status read failed: ${statusErr.message}`)

  const profileIds = new Set((profiles ?? []).map((r) => r.id as string))
  const statusByUser = new Map<string, AccountStatusRow>(
    (statuses ?? []).map((r) => [
      (r as { user_id: string }).user_id,
      r as unknown as AccountStatusRow,
    ]),
  )

  return selectMarketingRecipients(
    candidates,
    { profileIds, statusByUser, consentByUser, sendsByUser },
    now,
  )
}

export interface AudienceInputs {
  profileIds: ReadonlySet<string>
  statusByUser: ReadonlyMap<string, AccountStatusRow>
  consentByUser: ReadonlyMap<string, ConsentRow[]>
  sendsByUser: ReadonlyMap<string, Date[]>
}

/**
 * THE AUDIENCE DECISION, as a pure function.
 *
 * Separated from the queries so every rule can be asserted without a database,
 * and so a mutation to any one of them fails a test rather than changing an
 * audience silently. `candidates` arrives ordered and de-duplicated; this
 * preserves that order exactly.
 *
 * 🔑 A MISSING MAP ENTRY IS NOT MISSING DATA — IT IS THE ANSWER. No consent
 * rows means never opted in (M-1). No send history means never messaged, which
 * PERMITS a send. Those two absences point in opposite directions, which is
 * precisely why neither map is pre-filled with defaults: a default would have
 * to pick one meaning and would be wrong for the other.
 */
export function selectMarketingRecipients(
  candidates: readonly string[],
  inputs: AudienceInputs,
  now: Date,
): MarketingAudience {
  const recipients: string[] = []
  const skipped = emptySkipCounts()
  const refusals: { userId: string; reason: keyof SkipCounts }[] = []

  for (const userId of candidates) {
    // Layer 1 — may we message this account at all? Same rules as Phase C, and
    // `evaluateAccountStatus` is the shared definition, so an EXPIRED
    // suspension is treated as expired here too. Reading `is_suspended`
    // directly would turn a lapsed 7-day suspension into permanent exclusion
    // from every campaign, invisibly.
    const hasProfile = inputs.profileIds.has(userId)
    const restriction = evaluateAccountStatus(inputs.statusByUser.get(userId) ?? null, now)
    const eligible = hasProfile && !restriction.blocked

    // Layer 2 — may we send THIS message NOW?
    const decision = decideRecipient(
      {
        consent: inputs.consentByUser.get(userId) ?? [],
        sentAt: inputs.sendsByUser.get(userId) ?? [],
        eligible,
      },
      now,
    )

    if (decision.send) {
      recipients.push(userId)
    } else {
      skipped[decision.reason]++
      refusals.push({ userId, reason: decision.reason })
    }
  }

  return { recipients, candidates: candidates.length, skipped, refusals }
}
