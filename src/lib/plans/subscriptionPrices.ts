// SUBSCRIPTIONS — plan prices from configuration (subscriptionPrices.json).
// `vnd` is a FIXED catalog value (what the SePay order charges). It is never derived from .usd. by any calculation;
// `usd` is only the list-price label.

import prices from './subscriptionPrices.json'
import type { PaidPlanId } from './planConfig'

export interface PlanPrice { usd: number; vnd: number }

export const SUBSCRIPTION_PRICES: Readonly<{ plans: Record<PaidPlanId, PlanPrice> }> =
  Object.freeze(prices as { plans: Record<PaidPlanId, PlanPrice> })

/** "Chỉ khoảng …/tháng": the configured price spread over its months, rounded to the nearest 1.000đ. */
export function monthlyApproxVnd(vnd: number, durationDays: number): number {
  const months = Math.max(1, Math.round(durationDays / 30.4))
  return Math.round(vnd / months / 1_000) * 1_000
}
