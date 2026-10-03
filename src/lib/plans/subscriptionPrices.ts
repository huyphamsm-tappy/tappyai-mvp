// SUBSCRIPTIONS — plan prices from configuration (subscriptionPrices.json), all VND to the user.
// Written by the security session (p8/subscriptions). docs/payments/PLAN.md "Bảng giá".
//
// `niceVnd` is how the VND proposal was derived from the USD reference: usd × fxVndPerUsd, then the
// nearest price ending in …9.000đ (a tie goes to the lower one, in the buyer's favour).

import prices from './subscriptionPrices.json'
import type { PaidPlanId } from './planConfig'

export interface PlanPrice { usd: number; vnd: number }

export const SUBSCRIPTION_PRICES: Readonly<{ fxVndPerUsd: number; plans: Record<PaidPlanId, PlanPrice> }> =
  Object.freeze(prices as { fxVndPerUsd: number; plans: Record<PaidPlanId, PlanPrice> })

export function niceVnd(raw: number): number {
  const up = Math.ceil((raw + 1_000) / 10_000) * 10_000 - 1_000
  const down = up - 10_000
  return down > 0 && raw - down <= up - raw ? down : up
}

/** "Chỉ khoảng …/tháng": the configured price spread over its months, rounded to the nearest 1.000đ. */
export function monthlyApproxVnd(vnd: number, durationDays: number): number {
  const months = Math.max(1, Math.round(durationDays / 30.4))
  return Math.round(vnd / months / 1_000) * 1_000
}

export interface PriceRow {
  id: PaidPlanId
  days: number
  usd: number
  vnd: number
  proposedVnd: number
}

/** The table Huy approves: from the configured prices, nothing invented, nothing per day. */
export function priceTable(days: Record<PaidPlanId, number>, cfg = SUBSCRIPTION_PRICES): PriceRow[] {
  return (Object.keys(cfg.plans) as PaidPlanId[]).map((id) => ({
    id,
    days: days[id],
    usd: cfg.plans[id].usd,
    vnd: cfg.plans[id].vnd,
    proposedVnd: niceVnd(cfg.plans[id].usd * cfg.fxVndPerUsd),
  }))
}
