import type { SupabaseClient } from '@supabase/supabase-js'

// ─── V2.2-2 MARKETING — RETENTION PRUNING ────────────────────────────────────
//
// Contract:
//   M-26   `notification_deliveries` pruned at 1 year -- REQUIRED by doc 34
//          ("1 year, Prune, Campaign analysis window"). The mechanism must
//          EXIST and be TESTED, not assumed: a retention policy with no
//          implementation is a promise, and doc 34 spent months describing a
//          table that did not exist.
//   M-27   `marketing_campaigns` pruned at 1 year -- OWNER DECISION, aligned
//          with the delivery period. Doc 34 covers deliveries only; this
//          alignment is a deliberate choice and must not be relabelled as a
//          doc requirement.
//   M-27a  pruning must never orphan a delivery or an audit record.
//
// 🚨 THE ORDER IS MANDATORY AND THE DATABASE ENFORCES IT. `notification_
// deliveries` holds an `ON DELETE RESTRICT` foreign key to `marketing_
// campaigns`, so deleting campaigns first FAILS rather than silently
// cascading. That is the point: the constraint turns "remember to prune in the
// right order" into "the wrong order cannot happen".

/** One year, matching doc 34's row for `notification_deliveries`. */
export const RETENTION_MS = 365 * 24 * 60 * 60 * 1000

export interface PruneResult {
  deliveriesDeleted: number
  campaignsDeleted: number
  cutoff: string
}

/**
 * Delete marketing records older than one year.
 *
 * 🔑 CAMPAIGNS ARE PRUNED BY THEIR OWN AGE, NOT BY WHETHER THEIR DELIVERIES
 * ARE GONE. A campaign older than a year whose deliveries are NOT yet a year
 * old still has referencing rows, so the delete is refused by the FK — and the
 * refusal is correct: the analysis window doc 34 describes is about the
 * deliveries, and losing the campaign would leave rows nobody can explain.
 * Such a campaign is simply pruned on a later run, once its deliveries age
 * out. That is why the campaign delete is filtered on `created_at` and not
 * chased with a cleanup of anything that failed.
 *
 * ⚠️ THE CAMPAIGN DELETE IS DELIBERATELY NOT WRAPPED IN A RETRY OR A FORCE. A
 * foreign-key refusal here is information, not an obstacle: it says a delivery
 * still needs that campaign. Overriding it -- by switching to CASCADE, or by
 * deleting the deliveries first regardless of age -- would destroy the
 * frequency cap's history (M-6c) and the idempotency ledger (M-34) for people
 * who were messaged recently.
 *
 * Throws on failure rather than reporting a partial success. A prune that
 * silently deleted nothing would look identical to a prune that had nothing to
 * do, and the retention obligation would quietly stop being met.
 */
export async function pruneMarketingRetention(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<PruneResult> {
  const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString()

  // 1. Deliveries FIRST. They reference campaigns with ON DELETE RESTRICT.
  const { data: deliveries, error: dErr } = await admin
    .from('notification_deliveries')
    .delete()
    .lt('created_at', cutoff)
    .select('id')

  if (dErr) throw new Error(`marketing retention: delivery prune failed: ${dErr.message}`)

  // 2. Campaigns second, and only those old enough in their own right.
  const { data: campaigns, error: cErr } = await admin
    .from('marketing_campaigns')
    .delete()
    .lt('created_at', cutoff)
    .select('id')

  if (cErr) throw new Error(`marketing retention: campaign prune failed: ${cErr.message}`)

  return {
    deliveriesDeleted: (deliveries ?? []).length,
    campaignsDeleted: (campaigns ?? []).length,
    cutoff,
  }
}
