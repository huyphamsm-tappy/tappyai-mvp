// SUBSCRIPTIONS — what a client may show about "my plan" (docs/payments/PLAN.md). Pure.
//
// Written by the security session (p8/subscriptions). The server decides every state; clients only
// draw it. Never returns an internal field (ledger refs, staff notes, previous values, store ids).
//
//   ACTIVE     status 'active' and the period has not ended
//   CANCELLED  ended early (refund, staff revoke) — status 'canceled'
//   EXPIRED    the period ran out
//   PENDING    no paid plan, but a web order is waiting for the bank
//   NONE       never had one
//
// Renewal (Huy 2026-10-01):
//   store (Google Play / App Store)  auto-renews until the user turns it off IN THE STORE;
//                                    `autoRenew` mirrors the store, `manage` says which store page
//   web (SePay bank transfer)        ONE payment per period. Never auto-renews, no reminder. When it
//                                    ends it is EXPIRED and the user buys again (same flow).
//   manual (staff grant)             no renewal
// While a plan is ACTIVE nothing can be bought (one plan at a time); any plan — Pip included — can
// be bought again once it has ended.

import { PLAN_CONFIG, isSubscriptionPlanId } from '@/lib/plans/planConfig'

export type SubscriptionState = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PENDING' | 'NONE'
export type SubscriptionChannel = 'web' | 'google_play' | 'app_store' | 'manual' | 'legacy'

export interface SubscriptionRowForState {
  plan: string | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end?: boolean | null
  source?: string | null
}

export interface MySubscription {
  state: SubscriptionState
  /** The plan shown as "Gói hiện tại" (ACTIVE) or the last one (EXPIRED/CANCELLED). */
  plan: { id: string; name: string } | null
  periodEnd: string | null
  channel: SubscriptionChannel | null
  /** True only when a STORE will charge again at `periodEnd`. Web is always false. */
  autoRenew: boolean
  /** The buy button may be shown (no active plan). */
  canBuy: boolean
  /** Which store page "Quản lý gói" opens. Null = nothing to manage outside Tappy. */
  manage: 'google_play' | 'app_store' | null
}

function channelOf(source: string | null | undefined): SubscriptionChannel | null {
  switch (source) {
    case 'web_sepay': return 'web'
    case 'google_play': return 'google_play'
    case 'apple_iap': return 'app_store'
    case 'manual': return 'manual'
    case 'web': return 'legacy'
    default: return source ? 'legacy' : null
  }
}

function planInfo(plan: string | null): { id: string; name: string } | null {
  if (!plan || !isSubscriptionPlanId(plan)) return null
  return { id: plan, name: PLAN_CONFIG[plan].label }
}

export function mySubscription(
  row: SubscriptionRowForState | null,
  opts: { pendingOrder?: boolean; now?: Date } = {},
): MySubscription {
  const now = opts.now ?? new Date()
  const end = row?.current_period_end ? new Date(row.current_period_end) : null
  const live = !!row && row.status === 'active' && !!end && end > now
  const channel = row ? channelOf(row.source) : null

  let state: SubscriptionState
  if (live) state = 'ACTIVE'
  else if (opts.pendingOrder) state = 'PENDING'
  else if (!row || !row.status) state = 'NONE'
  else if (row.status === 'canceled' || row.status === 'cancelled') state = 'CANCELLED'
  else state = 'EXPIRED'

  const store = channel === 'google_play' || channel === 'app_store'
  return {
    state,
    plan: state === 'NONE' || state === 'PENDING' ? null : planInfo(row?.plan ?? null),
    periodEnd: state === 'NONE' || state === 'PENDING' ? null : row?.current_period_end ?? null,
    channel: state === 'NONE' ? null : channel,
    autoRenew: live && store && row?.cancel_at_period_end !== true,
    canBuy: !live,
    manage: live && store ? (channel === 'google_play' ? 'google_play' : 'app_store') : null,
  }
}
