// POST /api/payments/sepay — SePay bank-transfer webhook (docs/phase8/PAYMENTS.md §2.5).
//
// Behind `p8_payments` (404 while OFF). Machine-to-machine:
//   1. DEFAULT: HMAC-SHA256 `X-SePay-Signature` over "<X-SePay-Timestamp>.<raw body>" with
//      SEPAY_WEBHOOK_HMAC_SECRET, timestamp within 5 minutes, constant-time compare. Fallback (only with
//      SEPAY_WEBHOOK_AUTH_MODE=apikey): `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`. Optional
//      SEPAY_WEBHOOK_IP_ALLOWLIST. Anything else → 401.
//   2. The decision is ONE database transaction (`p8_payments_apply_sepay`):
//        - the same SePay transaction id twice → success, nothing granted twice;
//        - only incoming transfers to OUR account count;
//        - full amount → order paid → plan granted (stacked on the current expiry),
//          even when the 15-minute window has passed;
//        - short amount → the money stays ON the order (`mismatch`); a later top-up with the same code completes it;
//        - amount above the price → plan granted + the surplus as extra time at the plan's rate;
//        - a transfer on an already paid order → converted to extra time. NEVER a refund (owner 18/11/2026).
//   3. Any transaction we recorded answers 200 {"success": true}; a database failure
//      answers 500 so SePay retries (their retries are idempotent here).
//   4. The confirmation mail is best-effort, capped at 5 s, and cannot fail the webhook.
// No LLM, no quota.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { sepayProvider } from '@/lib/payments/providers'
import { sendPaymentMail } from '@/lib/payments/mail'
import type { PaidPlanId } from '@/lib/plans/planConfig'

export const dynamic = 'force-dynamic'

const OK = () => NextResponse.json({ success: true })

interface ApplyResult {
  result: 'duplicate' | 'ignored_out' | 'no_order' | 'paid' | 'late_paid' | 'extra_paid' | 'pip_used' | 'mismatch' | 'already_settled'
  user_id?: string | null
  plan?: PaidPlanId | null
  code?: string | null
  received_vnd?: number | null
  total_received_vnd?: number | null
  short_vnd?: number | null
  bonus_seconds?: number | null
  expires_at?: string | null
}

export async function POST(req: Request) {
  if (!subscriptionsEnabled()) return new NextResponse(null, { status: 404 })
  // The adapter verifies (secret + shape + our account, fail closed); the database matches the
  // amount against the server-created order. No client input can reach this decision.
  // The RAW body: the HMAC signature is over these exact bytes (never re-serialise parsed JSON).
  const rawBody = await req.text().catch(() => '')
  const verified = sepayProvider.verify({ headers: req.headers, rawBody })
  if (!verified.ok) {
    return verified.status === 401
      ? NextResponse.json({ success: false, error: 'unauthorized', message: 'Invalid signature' }, { status: 401 })
      : NextResponse.json({ success: false, error: 'invalid_payload', message: 'Not a SePay transaction' }, { status: 400 })
  }
  const tx = verified.event

  const db = createAdminClient()
  const { data, error } = await db.rpc('p8_payments_apply_sepay', {
    p_tx_id: tx.providerTxId,
    p_code: tx.orderCode,
    p_amount: tx.amountVnd,
    p_transfer_type: tx.direction,
    p_summary: tx.summary,
  })
  if (error) {
    return NextResponse.json({ success: false, error: 'not_recorded', message: 'Temporary failure, retry' }, { status: 500 })
  }

  const r = data as ApplyResult
  if ((r.result === 'paid' || r.result === 'late_paid' || r.result === 'mismatch' || r.result === 'extra_paid' || r.result === 'pip_used') && r.user_id && r.plan && r.code) {
    try {
      const { data: u } = await db.auth.admin.getUserById(r.user_id)
      const email = u?.user?.email
      if (email) {
        const kind = r.result === 'mismatch' ? 'partial' : (r.result === 'extra_paid' || r.result === 'pip_used') ? 'extra' : 'paid'
        await sendPaymentMail({
          to: email, plan: r.plan, code: r.code, expiresAt: r.expires_at ?? null, kind,
          amountVnd: (kind === 'extra' ? r.received_vnd : r.total_received_vnd) ?? r.received_vnd ?? tx.amountVnd,
          shortVnd: r.short_vnd ?? 0,
          bonusDays: Math.floor(Math.max(0, r.bonus_seconds ?? 0) / 86_400),
        })
      }
    } catch {
      // best-effort: the plan is already granted
    }
  }
  return OK()
}
