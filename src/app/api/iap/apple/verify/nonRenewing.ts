import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTransactionInfo, JWSVerificationError } from '@/lib/apple-iap/jws'
import { checkAppleTransaction, applePlanForProduct } from '@/lib/apple-iap/transactionPolicy'
import { isNonRenewingProduct, nonRenewingPeriod } from '@/lib/apple-iap/nonRenewing'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import { applyEntitlement, EntitlementWriteError } from '@/lib/payments/grantPlan'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/iap/apple/verify for a NON-RENEWING product (the 7-day Pip pack). See lib/apple-iap/nonRenewing.ts.
//
// Apple has no status and no expiry for these, so the ONLY trusted source is the cryptographically verified
// transaction (JWS). The end of the period is purchase date + the plan's length, computed here. Pip is one per
// account for life (the web rule too): refused when the account already holds ANY other Pip grant or a paid web
// Pip order; the database unique index on the ledger closes the race. The same transaction twice adds no time:
// the period is a pure function of the transaction and the ledger answers a repeated external_ref "duplicate".

type User = { id: string }
const json = (status: number, error: string, key: string, req: Request) =>
  NextResponse.json({ error, message: serverMessage(key as never, requestLocale(req)) }, { status })

export async function verifyNonRenewing(o: { req: Request; user: User; originalTransactionId: string; productId: string; signedTransactionInfo?: string }): Promise<Response> {
  const { req, user, originalTransactionId, productId, signedTransactionInfo } = o
  if (!signedTransactionInfo) return json(400, 'signed_transaction_required', 'subscription.invalidTransaction', req)

  let tx
  try {
    tx = await verifyTransactionInfo(signedTransactionInfo)
  } catch (err) {
    if (err instanceof JWSVerificationError) {
      console.error('[iap/apple/verify] non-renewing JWS invalid:', err.message)
      return json(400, 'invalid_transaction', 'subscription.invalidTransaction', req)
    }
    console.error('[iap/apple/verify] non-renewing JWS check failed:', err)
    return json(503, 'verify_unavailable', 'subscription.verifyUnavailable', req)
  }
  const refusal = checkAppleTransaction(tx, { originalTransactionId, appAccountToken: user.id, expectedProductId: productId })
  if (refusal) {
    console.error('[iap/apple/verify] non-renewing transaction refused:', refusal)
    return json(400, refusal === 'product_mismatch' || refusal === 'unknown_product' ? 'invalid_product' : 'invalid_transaction', 'subscription.invalidTransaction', req)
  }
  const plan = applePlanForProduct(tx.productId)
  if (!plan || !isNonRenewingProduct(tx.productId)) return json(400, 'invalid_product', 'subscription.invalidTransaction', req)

  let period
  try {
    period = nonRenewingPeriod(tx, PLAN_CONFIG[plan].durationDays ?? 0)
  } catch {
    return json(400, 'invalid_transaction', 'subscription.invalidTransaction', req)
  }
  const { expiresAt } = period
  const now = new Date()
  const subId = `apple_${tx.originalTransactionId}`
  const admin = createAdminClient()
  const unavailable = () => json(503, 'verify_unavailable', 'subscription.verifyUnavailable', req)

  // One App Store purchase, one TappyAI account.
  const [ledgerHolder, subHolder] = await Promise.all([
    admin.from('entitlement_ledger').select('user_id').eq('external_ref', subId).neq('user_id', user.id).limit(1),
    admin.from('subscriptions').select('user_id').eq('stripe_sub_id', subId).neq('user_id', user.id).limit(1),
  ])
  if (ledgerHolder.error || subHolder.error) return unavailable()
  if ((ledgerHolder.data?.length ?? 0) > 0 || (subHolder.data?.length ?? 0) > 0) return json(409, 'transaction_in_use', 'subscription.invalidTransaction', req)

  // An old purchase replayed by Restore: the 7 days are over. Report it, write nothing.
  if (expiresAt <= now) return NextResponse.json({ isPro: false, plan, currentPeriodEnd: expiresAt.toISOString() })

  // Pip is one per account for life, whatever way the first one came (store, web, staff grant). The same transaction again is not "another".
  const [otherPip, paidPip] = await Promise.all([
    admin.from('entitlement_ledger').select('external_ref').eq('user_id', user.id).eq('plan', 'pip').neq('external_ref', subId).limit(1),
    admin.from('payment_orders').select('id').eq('user_id', user.id).eq('plan', 'pip').eq('status', 'paid').limit(1),
  ])
  if (otherPip.error || paidPip.error) return unavailable()
  if ((otherPip.data?.length ?? 0) > 0 || (paidPip.data?.length ?? 0) > 0) return json(409, 'pip_already_used', 'payments.pipUsed', req)

  // A plan the account already holds that lasts longer than this pack is not replaced (one row per account; App Review 3.1.3(b)).
  const { data: existing, error: existingError } = await admin
    .from('subscriptions').select('plan, status, current_period_end, source, stripe_sub_id').eq('user_id', user.id).maybeSingle()
  if (existingError) return unavailable()
  const heldEnd = existing?.current_period_end ? new Date(existing.current_period_end as string) : null
  if (existing && existing.status === 'active' && heldEnd && !Number.isNaN(heldEnd.getTime()) && heldEnd > now && heldEnd > expiresAt && existing.stripe_sub_id !== subId) {
    console.info('[iap/apple/verify] non-renewing: kept the account\'s longer plan; nothing written')
    return NextResponse.json({ isPro: true, plan: existing.plan ?? plan, currentPeriodEnd: existing.current_period_end ?? null, kept: 'existing_plan' })
  }

  try {
    await applyEntitlement({
      userId: user.id, plan, channel: 'ios', externalRef: subId, mode: 'stack',
      baseAt: period.startsAt, seconds: Math.round((expiresAt.getTime() - period.startsAt.getTime()) / 1000), expiresAt,
      note: `apple_iap:${(tx.environment || 'Production').toLowerCase()}`,
    }, admin)
  } catch (err) {
    // 23505 = the ledger's one-Pip-per-account unique index: a second Pip landed first.
    if (err instanceof EntitlementWriteError && err.code === '23505') return json(409, 'pip_already_used', 'payments.pipUsed', req)
    console.error('[iap/apple/verify] non-renewing entitlement write failed:', err)
    return unavailable()
  }

  const { error } = await admin.from('subscriptions').upsert({
    user_id: user.id, stripe_sub_id: subId, plan, source: 'apple_iap', status: 'active',
    current_period_end: expiresAt.toISOString(), cancel_at_period_end: false, grant_note: `apple_iap:${(tx.environment || 'Production').toLowerCase()}`,
  }, { onConflict: 'user_id' })
  if (error) {
    console.error('[iap/apple/verify] non-renewing upsert error:', error)
    return json(500, 'sync_failed', 'subscription.syncFailed', req)
  }
  return NextResponse.json({ isPro: true, plan, currentPeriodEnd: expiresAt.toISOString() })
}
