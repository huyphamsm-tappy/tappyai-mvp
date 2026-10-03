// POST /api/payments/orders — create a VietQR order for a plan { plan }.
// GET  /api/payments/orders?id=<uuid> — my order's status (the payment screen's polling fallback).
//
// PAYMENTS (docs/phase8/PAYMENTS.md §2.5), behind `p8_payments` (404 while OFF).
// Signed-in accounts only (a guest has no account to put the plan on). The
// database creates the order atomically: code TAPPY + 6, 15-minute expiry, at
// most 3 live pending orders per user. Price and length come from PLAN_CONFIG —
// the client only names the plan. The plan is granted ONLY by the SePay webhook.
// SUBSCRIPTIONS (p8/subscriptions, security session): with SUBSCRIPTIONS_ENABLED an account with an
// active plan gets 409; after it ends it buys again (web plans are one payment per period).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePayer } from '@/lib/payments/authGuard'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { mySubscription, type SubscriptionRowForState } from '@/lib/payments/subscriptionState'
import { MY_PLAN_COLUMNS } from '@/lib/payments/myPlan'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { PAID_PLAN_IDS, PLAN_CONFIG, type PaidPlanId } from '@/lib/plans/planConfig'
import { MAX_PENDING_ORDERS, ORDER_TTL_SECONDS, sepayBankConfig, sepayQrUrl } from '@/lib/payments/sepay'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({ plan: z.enum(PAID_PLAN_IDS as unknown as [PaidPlanId, ...PaidPlanId[]]) })
const ORDER_COLUMNS = 'id, plan, amount_vnd, code, status, expires_at, paid_at, created_at'

interface OrderRow {
  id: string
  plan: PaidPlanId
  amount_vnd: number
  code: string
  status: 'pending' | 'paid' | 'expired' | 'mismatch'
  expires_at: string
  paid_at: string | null
}

/** Pending past its 15 minutes reads as expired (a late transfer is still honoured by the webhook). */
function publicStatus(o: OrderRow, now = Date.now()): OrderRow['status'] {
  return o.status === 'pending' && new Date(o.expires_at).getTime() <= now ? 'expired' : o.status
}

export async function POST(req: Request) {
  if (!subscriptionsEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const auth = await requirePayer(req)
  if (auth instanceof Response) return auth
  const bank = sepayBankConfig()
  if (!bank) {
    return NextResponse.json({ error: 'payments_unavailable', message: serverMessage('payments.unavailable', locale) }, { status: 503 })
  }
  if (!(await distributedRateLimit(`payments-orders:${auth.user.id}`, 10, 10 * 60_000)).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('payments.slowDown', locale) }, { status: 429 })
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_plan', message: serverMessage('payments.invalidPlan', locale) }, { status: 400 })
  }

  const plan = PLAN_CONFIG[parsed.data.plan]
  // SUBSCRIPTIONS: one plan at a time. While a plan is active nothing can be bought (a store plan is
  // never topped up from the web either — it would be billed twice); once it ends, any plan, Pip
  // included, can be bought again.
  if (subscriptionsEnabled()) {
    const { data: row } = await auth.supabase.from('subscriptions')
      .select(MY_PLAN_COLUMNS).eq('user_id', auth.user.id).maybeSingle()
    const mine = mySubscription(row as SubscriptionRowForState | null)
    if (mine.state === 'ACTIVE') {
      const key = mine.manage ? 'payments.manageInStore' : 'payments.alreadyActive'
      return NextResponse.json({ error: 'already_active', message: serverMessage(key, locale) }, { status: 409 })
    }
  }
  const { data, error } = await createAdminClient().rpc('p8_payments_create_order', {
    p_user: auth.user.id,
    p_plan: plan.id,
    p_amount: plan.priceVnd,
    p_days: plan.durationDays,
    p_ttl_seconds: ORDER_TTL_SECONDS,
    p_max_pending: MAX_PENDING_ORDERS,
  })
  if (error) {
    return NextResponse.json({ error: 'order_failed', message: serverMessage('payments.failed', locale) }, { status: 500 })
  }
  const result = data as { status: string; order?: OrderRow }
  // Pip is a one-time trial per account for life (owner decision): the database decides, from the ledger
  // and the order history — a second Pip never gets an order, however the first one ended.
  if (result.status === 'pip_used') {
    return NextResponse.json({ error: 'pip_already_used', message: serverMessage('payments.pipUsed', locale) }, { status: 409 })
  }
  if (result.status === 'too_many_pending' || !result.order) {
    return NextResponse.json({ error: 'too_many_pending', message: serverMessage('payments.tooManyPending', locale) }, { status: 429 })
  }

  const o = result.order
  return NextResponse.json({
    order: { id: o.id, code: o.code, plan: o.plan, amountVnd: o.amount_vnd, status: 'pending', expiresAt: o.expires_at },
    bank: { accountNumber: bank.accountNumber, accountName: bank.accountName, bankCode: bank.bankCode },
    qrUrl: sepayQrUrl(bank, o.amount_vnd, o.code),
  }, { status: 201 })
}

export async function GET(req: Request) {
  if (!subscriptionsEnabled()) return new NextResponse(null, { status: 404 })
  const auth = await requirePayer(req)
  if (auth instanceof Response) return auth
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('payments.failed', requestLocale(req)) }, { status: 404 })
  }
  // RLS: the caller's own orders only.
  const { data } = await auth.supabase.from('payment_orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle()
  if (!data) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('payments.failed', requestLocale(req)) }, { status: 404 })
  }
  const o = data as OrderRow
  return NextResponse.json({ order: { id: o.id, code: o.code, plan: o.plan, amountVnd: o.amount_vnd, status: publicStatus(o), expiresAt: o.expires_at, paidAt: o.paid_at } })
}
