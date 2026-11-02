// GET /api/payments/history — my web payments (mockup 8: "Lịch sử thanh toán").
//
// SUBSCRIPTIONS (docs/payments/PLAN.md), behind SUBSCRIPTIONS_ENABLED (404 while OFF). Written by the
// security session (p8/subscriptions). Cheap by design: the caller's own `payment_orders` rows under
// RLS (own-row read already exists), only orders where money arrived (paid / short). Date, plan,
// amount, status — no bank details, no codes of other people, nothing internal. Store purchases are
// listed by the store itself.

import { NextResponse } from 'next/server'
import { requirePayer } from '@/lib/payments/authGuard'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { PLAN_CONFIG, isSubscriptionPlanId } from '@/lib/plans/planConfig'

export const dynamic = 'force-dynamic'

export interface PaymentHistoryItem {
  date: string
  plan: { id: string; name: string } | null
  amountVnd: number
  status: 'paid' | 'mismatch'
}

export async function GET(req: Request) {
  if (!subscriptionsEnabled()) return new NextResponse(null, { status: 404 })
  const auth = await requirePayer(req)
  if (auth instanceof Response) return auth
  const { data } = await auth.supabase.from('payment_orders')
    .select('plan, amount_vnd, received_vnd, status, paid_at, created_at')
    .eq('user_id', auth.user.id).in('status', ['paid', 'mismatch'])
    .order('created_at', { ascending: false }).limit(20)
  const items: PaymentHistoryItem[] = ((data ?? []) as {
    plan: string; amount_vnd: number; received_vnd: number | null; status: 'paid' | 'mismatch'; paid_at: string | null; created_at: string
  }[]).map((o) => ({
    date: o.paid_at ?? o.created_at,
    plan: isSubscriptionPlanId(o.plan) ? { id: o.plan, name: PLAN_CONFIG[o.plan].label } : null,
    amountVnd: o.status === 'paid' ? o.amount_vnd : (o.received_vnd ?? 0),
    status: o.status,
  }))
  return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } })
}
