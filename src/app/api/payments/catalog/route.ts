// GET /api/payments/catalog — the plan catalog for the apps (docs/phase8/PAYMENTS.md §2.4).
//
// Behind `p8_payments` (404 while OFF). Names, periods, store product ids, the "popular" plan and
// the RevenueCat entitlement/offering — from PLAN_CONFIG, the one config file. `?app=1` (Android/iOS)
// leaves out the web prices: the apps show the store's own price (Google Play policy). Public data.

import { NextResponse } from 'next/server'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { REVENUECAT_ENTITLEMENT_ID, REVENUECAT_OFFERING_ID, paymentsCatalog } from '@/lib/plans/planConfig'
import { subscriptionCatalog } from '@/lib/payments/subscriptionCatalog'

export async function GET(req: Request) {
  if (!subscriptionsEnabled()) return new NextResponse(null, { status: 404 })
  const forApp = new URL(req.url).searchParams.get('app') === '1'
  // SUBSCRIPTIONS (docs/payments/PLAN.md): the shared card list — no badge, honest value hints,
  // character manifest, Free/guest allowances from the live config.
  if (subscriptionsEnabled()) {
    return NextResponse.json(
      { entitlement: REVENUECAT_ENTITLEMENT_ID, offering: REVENUECAT_OFFERING_ID, ...subscriptionCatalog({ forApp }) },
      { headers: { 'cache-control': 'public, max-age=300' } },
    )
  }
  return NextResponse.json(
    { entitlement: REVENUECAT_ENTITLEMENT_ID, offering: REVENUECAT_OFFERING_ID, plans: paymentsCatalog({ forApp }) },
    { headers: { 'cache-control': 'public, max-age=300' } },
  )
}
