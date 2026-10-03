// PHASE 8 / Task 12 — THE plan configuration. One source; nothing else may
// hardcode a plan's price, duration or AI allowance.
//
// AI allowance is ONE global pool per identity (not per feature). The day is
// the Vietnam calendar day (Asia/Ho_Chi_Minh, UTC+7, no DST) — see `vnToday()`.
//
// Changing a number here is the whole change: e.g. Free 10/day → 5/day is
// `free.aiQuota.limit: 5`, no other file.
//
// P7 closeout (owner 02/10): Free keeps the approved release value FREE_DAILY_LIMIT (15/day), guest 5 for the lifetime, every paid plan 30/day.
// A legacy `pro` row (Stripe/Apple) stays unmetered until its paid period ends (isGrandfatheredPro), then it is a 30/day plan like the others.

import { FREE_DAILY_LIMIT } from '@/lib/config/product'
import { SUBSCRIPTION_PRICES } from './subscriptionPrices'

/** Prices come from configuration (subscriptionPrices.json) — never typed here. */
const P = SUBSCRIPTION_PRICES.plans

export type PaidPlanId = 'pip' | 'momo' | 'coco' | 'milo' | 'sunny'
/** `pro` is the legacy Stripe/Apple plan id already stored in `subscriptions.plan`. */
export type SubscriptionPlanId = PaidPlanId | 'pro'
export type PlanId = 'guest' | 'free' | SubscriptionPlanId

export type QuotaPeriod = 'day' | 'lifetime'

export interface AiQuotaRule {
  limit: number
  period: QuotaPeriod
}

export interface PlanDefinition {
  id: PlanId
  label: string
  aiQuota: AiQuotaRule
  /**
   * Paid plans only. WEB price (SePay/VietQR), VND. The app stores (Google Play,
   * App Store) price the same product themselves — the apps show the store's
   * price and never this one (Google Play policy). docs/phase8/PAYMENTS.md §2.4.
   */
  priceVnd?: number
  /** Paid plans only. Length of one period, in days. */
  durationDays?: number
  /** Paid plans only. Human period for the plan picker ("7 ngày", "1 tháng"…). */
  periodLabelVi?: string
  /** Paid plans only. Google Play / App Store product id (RevenueCat entitlement `tappy_plus`). */
  storeProductId?: string
  /** Paid plans only. The one plan the picker badges "Phổ biến". Ignored with SUBSCRIPTIONS_ENABLED (no badges). */
  popular?: boolean
  /**
   * Paid plans only (SUBSCRIPTIONS, docs/payments/PLAN.md). The USD reference the VND price was
   * derived from (subscriptionPrices.json). NEVER displayed anywhere — every client shows VND.
   */
  priceUsd?: number
  /** Paid plans only. Sold on the stores as an auto-renewing subscription (default true). */
  storeAutoRenew?: boolean
  /** SUBSCRIPTIONS: the one badge Huy approved (2026-10-01): Sunny "Phổ biến nhất". */
  subscriptionBadge?: 'popular'
  /** SUBSCRIPTIONS: show "Chỉ khoảng …/tháng" on the plan detail (Huy: Sunny only). */
  showMonthlyApprox?: boolean
}

export const PLAN_CONFIG: Readonly<Record<PlanId, PlanDefinition>> = Object.freeze({
  guest: { id: 'guest', label: 'Guest', aiQuota: { limit: 5, period: 'lifetime' } },
  free: { id: 'free', label: 'Free', aiQuota: { limit: FREE_DAILY_LIMIT, period: 'day' } },
  pip: { id: 'pip', label: 'Pip', priceVnd: P.pip.vnd, priceUsd: P.pip.usd, durationDays: 7, periodLabelVi: '7 ngày', storeProductId: 'tappy_pip_1w', aiQuota: { limit: 30, period: 'day' } },
  momo: { id: 'momo', label: 'Momo', priceVnd: P.momo.vnd, priceUsd: P.momo.usd, durationDays: 30, periodLabelVi: '1 tháng', storeProductId: 'tappy_momo_1m', popular: true, aiQuota: { limit: 30, period: 'day' } },
  coco: { id: 'coco', label: 'Coco', priceVnd: P.coco.vnd, priceUsd: P.coco.usd, durationDays: 90, periodLabelVi: '3 tháng', storeProductId: 'tappy_coco_3m', aiQuota: { limit: 30, period: 'day' } },
  milo: { id: 'milo', label: 'Milo', priceVnd: P.milo.vnd, priceUsd: P.milo.usd, durationDays: 180, periodLabelVi: '6 tháng', storeProductId: 'tappy_milo_6m', aiQuota: { limit: 30, period: 'day' } },
  sunny: { id: 'sunny', label: 'Sunny', priceVnd: P.sunny.vnd, priceUsd: P.sunny.usd, durationDays: 365, periodLabelVi: '12 tháng', storeProductId: 'tappy_sunny_12m', subscriptionBadge: 'popular', showMonthlyApprox: true, aiQuota: { limit: 30, period: 'day' } },
  // Legacy paid plan (Stripe `STRIPE_PRO_PRICE_ID`, Apple IAP). Was quota-EXEMPT
  // in the release; under the v2 quota it is a 30/day paid plan like the others.
  pro: { id: 'pro', label: 'Pro', aiQuota: { limit: 30, period: 'day' } },
})

export const PAID_PLAN_IDS: readonly PaidPlanId[] = ['pip', 'momo', 'coco', 'milo', 'sunny']
export const SUBSCRIPTION_PLAN_IDS: readonly SubscriptionPlanId[] = [...PAID_PLAN_IDS, 'pro']

/**
 * Owner decision (Sub 2, 2026-09-25): legacy `pro` becomes 30/day under the v2
 * quota, EXCEPT a subscriber who is actually paying keeps the release's
 * unlimited allowance until their current paid period ends (`current_period_end`
 * — the entitlement itself expires then). `pro` is written only by the Stripe
 * webhook and the Apple IAP verify route; the manual grant cannot issue it, so
 * an active `pro` row is a paying one.
 *
 * `PRO_GRANDFATHER_CUTOFF` (ISO date, optional): after it, no `pro` period is
 * grandfathered any more — for when the legacy Stripe price keeps renewing and
 * the owner wants the grandfathering to end on a known date.
 */
export function isGrandfatheredPro(
  ent: { plan: PlanId; paid: boolean; periodEnd: string | null },
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (ent.plan !== 'pro' || !ent.paid || !ent.periodEnd) return false
  if (new Date(ent.periodEnd) <= now) return false
  const cutoff = env.PRO_GRANDFATHER_CUTOFF ? new Date(env.PRO_GRANDFATHER_CUTOFF) : null
  return !(cutoff && !Number.isNaN(cutoff.getTime()) && now > cutoff)
}

export function isSubscriptionPlanId(v: unknown): v is SubscriptionPlanId {
  return typeof v === 'string' && (SUBSCRIPTION_PLAN_IDS as readonly string[]).includes(v)
}

/** The AI allowance a plan has RIGHT NOW (one source: this table; Free = the release value FREE_DAILY_LIMIT). */
export function aiQuotaFor(plan: PlanId): AiQuotaRule {
  return PLAN_CONFIG[plan].aiQuota
}

// ── Payments catalog (docs/phase8/PAYMENTS.md §2.4) ─────────────────────────

/** RevenueCat entitlement every paid product unlocks, and the offering the apps load. */
export const REVENUECAT_ENTITLEMENT_ID = 'tappy_plus'
export const REVENUECAT_OFFERING_ID = 'default'

export interface CatalogPlan {
  id: PaidPlanId
  name: string
  periodLabel: string
  durationDays: number
  dailyAiQuestions: number
  storeProductId: string
  popular: boolean
  /** Web only (SePay/VietQR). Omitted from the app catalog: the apps show the store's price. */
  priceVnd?: number
  /** Web only: price per day, rounded, for plans longer than a month. */
  pricePerDayVnd?: number
}

/** The catalog. `forApp` drops web prices (Google Play policy: no mention of the web price in the app). */
export function paymentsCatalog(opts: { forApp?: boolean } = {}): CatalogPlan[] {
  return PAID_PLAN_IDS.map((id) => {
    const p = PLAN_CONFIG[id]
    const days = p.durationDays!
    const plan: CatalogPlan = {
      id,
      name: p.label,
      periodLabel: p.periodLabelVi!,
      durationDays: days,
      dailyAiQuestions: p.aiQuota.limit,
      storeProductId: p.storeProductId!,
      popular: p.popular === true,
    }
    if (!opts.forApp) {
      plan.priceVnd = p.priceVnd!
      if (days > 30) plan.pricePerDayVnd = Math.round(p.priceVnd! / days)
    }
    return plan
  })
}

/** Store product id → plan. Accepts Google's `productId:basePlanId` form (RevenueCat sends it for Play). */
export function planForStoreProduct(productId: string | null | undefined): PaidPlanId | null {
  if (!productId) return null
  const base = productId.split(':')[0]
  return PAID_PLAN_IDS.find((id) => PLAN_CONFIG[id].storeProductId === base) ?? null
}
