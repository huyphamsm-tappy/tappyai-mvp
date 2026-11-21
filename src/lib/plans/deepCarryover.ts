// Carry-over of unused Deep Research reports when a new plan is bought (owner 21/11/2026: "phải đảm bảo lợi ích của người dùng").
//
// The days already stack in the database (p8_apply_entitlement mode 'stack': the new period starts where the active one ends). This is the other half: the reports the person still had LEFT
// this month, under the plan they were on, are added ONCE to the NEXT month's allowance (aiQuestionQuota.grantDeepResearchCarryover). Two steps because the old plan is only known
// BEFORE the payment is applied: `reportsLeftBeforePurchase` reads it, `carryOverAfterPurchase` records it once the purchase is really new (paid / late_paid, never a replay).
// Best effort and never throws: the plan is already granted, a failed carry-over must not turn a payment into an error.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getEntitlement } from './entitlement'
import { tierOf, deepResearchMonthlyLimit } from './tiers'
import { grantDeepResearchCarryover, peekDeepResearch } from '@/lib/ai/quota/aiQuestionQuota'

/** Reports the person can still use this month under their CURRENT paid plan (0 when they have no active paid plan, or the store did not answer). */
export async function reportsLeftBeforePurchase(db: SupabaseClient, userId: string): Promise<number> {
  try {
    const ent = await getEntitlement(db, { id: userId, is_anonymous: false })
    if (!ent.paid) return 0
    const limit = deepResearchMonthlyLimit(tierOf(ent.plan), { subscriptionsOn: true, signedIn: true })
    if (limit <= 0) return 0
    const left = (await peekDeepResearch(userId, limit)).remaining
    return typeof left === 'number' && left > 0 ? left : 0
  } catch {
    return 0
  }
}

/** Records the carry-over for a purchase that was really applied now. Returns how many reports were carried. */
export async function carryOverAfterPurchase(userId: string, left: number, result: string | undefined): Promise<number> {
  if (result !== 'paid' && result !== 'late_paid') return 0 // a replayed webhook ('duplicate') or a partial payment carries nothing
  if (!(left > 0)) return 0
  try {
    return await grantDeepResearchCarryover(userId, left)
  } catch {
    return 0
  }
}
