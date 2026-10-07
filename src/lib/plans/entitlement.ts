// PHASE 8 / Task 12 — the ONE entitlement rule.
//
// A subscription entitles its plan when `status === 'active'` and
// `current_period_end` is in the future. This is exactly the rule the release
// applied inline in four places (chat route, /api/subscription,
// `isProAccount`, the subscription page); it now lives here and they call it.
//
// Anything that does not prove an active paid plan is Free — a read failure
// included: the free tier is the safe answer when the entitlement cannot be
// confirmed. Anonymous identities are Guest and never read a subscription.

import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isSubscriptionPlanId, type PlanId } from './planConfig'

/** `web` = legacy Stripe; `web_sepay` = VietQR bank transfer (PAYMENTS). */
export type SubscriptionSource = 'web' | 'apple_iap' | 'google_play' | 'manual' | 'web_sepay'

export interface SubscriptionRow {
  plan?: string | null
  status?: string | null
  current_period_end?: string | null
  period_start?: string | null
  source?: string | null
}

export interface Entitlement {
  plan: PlanId
  /** True only for an active, unexpired paid plan. */
  paid: boolean
  periodEnd: string | null
  source: SubscriptionSource | null
}

const FREE: Entitlement = { plan: 'free', paid: false, periodEnd: null, source: null }
const GUEST: Entitlement = { plan: 'guest', paid: false, periodEnd: null, source: null }

/** Pure decision, testable without a database. */
export function entitlementFromRow(row: SubscriptionRow | null | undefined, now: Date = new Date()): Entitlement {
  if (!row || row.status !== 'active' || !row.current_period_end) return FREE
  const end = new Date(row.current_period_end)
  if (Number.isNaN(end.getTime()) || end <= now) return FREE
  // A legacy row with no plan text was written as Pro by every release writer.
  const plan = row.plan == null ? 'pro' : row.plan
  if (!isSubscriptionPlanId(plan)) return FREE
  const source = (['web', 'apple_iap', 'google_play', 'manual', 'web_sepay'] as const).find((s) => s === row.source) ?? null
  return { plan, paid: true, periodEnd: row.current_period_end, source }
}

export const SUBSCRIPTION_COLUMNS = 'plan, status, current_period_end'

/** Reads the caller's own subscription (RLS: own row only) and decides. Never throws. */
export async function getEntitlement(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'is_anonymous'> | null,
  now: Date = new Date(),
): Promise<Entitlement> {
  if (!user) return GUEST
  if (user.is_anonymous === true) return GUEST
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()
    return entitlementFromRow(data as SubscriptionRow | null, now)
  } catch {
    return FREE
  }
}
