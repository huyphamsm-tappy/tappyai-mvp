// GET /api/cron/subscriptions-expire — mark ended plans `expired` (docs/payments/PLAN.md).
//
// SUBSCRIPTIONS, written by the security session (p8/subscriptions). Double-gated: `CRON_SECRET`
// (fails closed if unset, like every cron) AND SUBSCRIPTIONS_ENABLED. Phase 7: scheduled daily at 00:00 VN (17:00 UTC) in
// vercel.json — within the current Vercel plan's daily-cron limit. Access never depended on this job: the
// entitlement rule already treats a past `current_period_end` as not paid; this only makes the
// stored status say so. Ledger-era rows only (legacy Stripe/Apple rows keep their own writers).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!subscriptionsEnabled()) return NextResponse.json({ ok: true, skipped: 'flag_off' })
  const { data, error } = await createAdminClient().rpc('p8_subscriptions_expire')
  if (error) {
    console.error('[subscriptions-expire] failed:', error.code)
    return NextResponse.json({ error: 'expire_failed' }, { status: 500 })
  }
  // Count only — never user ids.
  return NextResponse.json({ ok: true, expired: Number(data) || 0 })
}
