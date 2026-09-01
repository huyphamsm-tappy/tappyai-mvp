import type { SupabaseClient } from '@supabase/supabase-js'
import type { SkipReason } from './governance'
import { WINDOW_7D_MS } from './governance'

// ─── V2.2-2 MARKETING — THE DELIVERY LEDGER ──────────────────────────────────
//
// Contract: M-6c (this IS the frequency cap's history) · M-7 (skips are
// recorded, not dropped) · M-34 (per-recipient idempotency) · M-35 · M-36.
//
// 🔑 ONE TABLE, TWO JOBS, AND THAT IS DELIBERATE.
//
//   1. HISTORY. The rolling 24h/7d caps are computed from `status = 'sent'`
//      rows here. A send that is not recorded is invisible to the cap, so
//      writing the row is part of the cap rather than bookkeeping about it.
//
//   2. LEDGER. `UNIQUE (campaign_id, user_id)` means a resumed campaign cannot
//      notify the same person twice — the second insert conflicts rather than
//      producing a second push.
//
// 🚨 A SKIPPED ROW IS NOT A SEND. Skips are recorded so a campaign can explain
// itself, but they must never count toward the cap. Reading them as history
// would let one quiet-hours skip silence somebody for the next 24 hours — the
// governance rule punishing the person it exists to protect.

/** Only `sent` rows are history. `skipped` rows explain a campaign, nothing more. */
export type DeliveryStatus = 'sent' | 'skipped'

export interface DeliveryRecord {
  campaignId: string
  userId: string
  status: DeliveryStatus
  /** Required when skipped, forbidden when sent — the database CHECKs both. */
  skipReason?: SkipReason
  notificationId?: string | null
}

/**
 * When each of these users was last sent a marketing message, within the
 * longest window any cap uses.
 *
 * BOUNDED BY `WINDOW_7D_MS` because that is the widest window `frequencyBreach`
 * looks at (M-6b). Reading further back would return rows no rule can use and
 * would grow without limit as the table fills — the 1-year retention is for
 * analysis, not for the cap.
 *
 * A user with no history is ABSENT FROM THE MAP. The caller must read a missing
 * entry as an empty array; pre-filling defaults is the shape a "nobody has ever
 * been messaged" bug takes.
 *
 * Throws on a query failure. An empty history means "never sent", which permits
 * a send — so a failed read that returned empty would silently REMOVE the cap
 * for everyone, which is the one direction that cannot be allowed to happen by
 * accident.
 */
export async function readRecentSends(
  admin: SupabaseClient,
  userIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, Date[]>> {
  const byUser = new Map<string, Date[]>()
  if (userIds.length === 0) return byUser

  const since = new Date(now.getTime() - WINDOW_7D_MS).toISOString()
  const { data, error } = await admin
    .from('notification_deliveries')
    .select('user_id, created_at')
    .eq('status', 'sent')
    .eq('category', 'marketing')
    .in('user_id', [...userIds])
    .gte('created_at', since)

  if (error) throw new Error(`marketing delivery: history read failed: ${error.message}`)

  for (const row of data ?? []) {
    const r = row as { user_id: string; created_at: string }
    const list = byUser.get(r.user_id) ?? []
    list.push(new Date(r.created_at))
    byUser.set(r.user_id, list)
  }
  return byUser
}

/**
 * Which of these users already have a row for this campaign.
 *
 * THE RESUME QUESTION (M-34, M-36). A campaign that died mid-run is resumed by
 * skipping everyone already recorded — never by re-sending and hoping the
 * duplicate suppression window catches it. That window is 60 seconds and a
 * resume can happen hours later.
 */
export async function alreadyRecorded(
  admin: SupabaseClient,
  campaignId: string,
  userIds: readonly string[],
): Promise<Set<string>> {
  const seen = new Set<string>()
  if (userIds.length === 0) return seen

  const { data, error } = await admin
    .from('notification_deliveries')
    .select('user_id')
    .eq('campaign_id', campaignId)
    .in('user_id', [...userIds])

  if (error) throw new Error(`marketing delivery: ledger read failed: ${error.message}`)
  for (const row of data ?? []) seen.add((row as { user_id: string }).user_id)
  return seen
}

/**
 * Write delivery rows.
 *
 * 🚨 `ON CONFLICT DO NOTHING` on `(campaign_id, user_id)`. A conflict means this
 * person was already recorded for this campaign, which is exactly the state a
 * resume is supposed to leave alone — so the correct handling is to keep the
 * FIRST row, not to overwrite it with the second. An upsert that updated would
 * let a re-run rewrite history and, worse, change a `sent` row into a `skipped`
 * one, which would hand the person back to the frequency cap as if they had
 * never been messaged.
 *
 * Records are written in one statement per batch so a partially-failed campaign
 * still leaves a truthful ledger for the part that succeeded.
 */
export async function recordDeliveries(
  admin: SupabaseClient,
  records: readonly DeliveryRecord[],
): Promise<void> {
  if (records.length === 0) return

  const rows = records.map((r) => ({
    campaign_id: r.campaignId,
    user_id: r.userId,
    status: r.status,
    // The database CHECKs that a sent row has no reason and a skipped row has
    // one. Passing `null` explicitly rather than omitting the key keeps the
    // insert shape uniform across a mixed batch.
    skip_reason: r.status === 'skipped' ? (r.skipReason ?? null) : null,
    notification_id: r.notificationId ?? null,
  }))

  const { error } = await admin
    .from('notification_deliveries')
    .upsert(rows, { onConflict: 'campaign_id,user_id', ignoreDuplicates: true })

  if (error) throw new Error(`marketing delivery: write failed: ${error.message}`)
}
