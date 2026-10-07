// GET /api/payments/me — "my plan" + today's AI allowance, for web, Android and iOS.
//
// SUBSCRIPTIONS (docs/payments/PLAN.md), behind SUBSCRIPTIONS_ENABLED (404 while OFF). Written by
// the security session (p8/subscriptions).
//
// The server is the source of truth: state, period end, renewal and the allowance come from the
// subscription row + the SAME quota store /api/chat spends from (display cannot drift from
// enforcement). Guests get the guest allowance and no plan. Nothing internal is returned. Read-only:
// web plans have nothing to switch (one payment per period); store plans are managed in the store.

import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { aiQuotaIdentity, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { clientIp } from '@/lib/security/rateLimit'
import { mySubscription } from '@/lib/payments/subscriptionState'
import { loadMyPlan } from '@/lib/payments/myPlan'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!subscriptionsEnabled()) return new NextResponse(null, { status: 404 })
  const { user, supabase } = await getRequestUser(req)
  if (user && user.is_anonymous !== true) {
    return NextResponse.json(await loadMyPlan(supabase, user.id, clientIp(req)), { headers: { 'cache-control': 'no-store' } })
  }
  // Guests (and anonymous sessions): the guest allowance, no plan.
  const q = await peekAiQuestionQuota(aiQuotaIdentity(user, clientIp(req)))
  const used = q.used ?? q.limit
  const quota = { limit: q.limit, used, remaining: Math.max(0, q.limit - used), period: q.period }
  return NextResponse.json({ signedIn: false, subscription: mySubscription(null), pipUsed: false, quota }, { headers: { 'cache-control': 'no-store' } })
}
