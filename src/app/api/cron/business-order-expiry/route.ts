import { logBusinessError } from '@/lib/business/logging'
import { NextResponse } from 'next/server'
import { expireStaleOrders } from '@/lib/business/repositories/orders'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'

export const runtime = 'nodejs'
export const maxDuration = 60

// Tappy Business — close PENDING orders past their 72 hours.
//
// P0 §19/§20. A merchant who never answers must not leave the customer reading
// "shop đang xử lý" forever, so the system closes the order as REJECTED with
// `actor_type = 'SYSTEM'` and `reason = 'EXPIRED'`. The customer-facing state
// stays one of PENDING / ACCEPTED / REJECTED — the expiry is visible to the
// merchant and to an auditor, not as a fourth state to the customer.
//
// 🔑 THE ROUTE HOLDS NO POLICY. The conditional update and its history row both
// happen inside `fn_business_expire_orders`, because only the database can make
// them atomic: a merchant accepting at hour 71:59 and this job running at the
// same moment must not both succeed.
//
// SCHEDULE, honestly stated: daily, matching every other cron here. An order
// therefore closes up to ~24 hours after its 72 are up. That is latency in the
// closing, not in the guarantee — the order is never accepted after expiry,
// because the merchant's own accept path will check the same condition. A finer
// interval changes only how quickly the customer sees it.
//
// AUTH: the platform's `CRON_SECRET` bearer through the shared constant-time
// check (security-audit L6), identical to every other cron route. This
// authenticates a trusted job, not a user.

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const expired = await expireStaleOrders()
    return NextResponse.json({ ok: true, expired })
  } catch (e) {
    logBusinessError('cron.order', e)
    return NextResponse.json({ error: 'expiry_failed' }, { status: 500 })
  }
}
