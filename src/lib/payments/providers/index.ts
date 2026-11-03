// SUBSCRIPTIONS — provider adapters (see ./types.ts). Written by the security session.
//
//   sepay        REAL — SePay bank-transfer webhook: HMAC-SHA256 over "<timestamp>.<raw body>" by default,
//                Apikey only as the configured fallback, optional source-IP allowlist
//   fake_bank    TEST ONLY — produces SePay-shaped, correctly authorised transfers so tests drive the
//                REAL verification + database path; refuses to exist in production
//   app_store    SKELETON — store purchases arrive verified through RevenueCat
//   google_play  SKELETON   (/api/payments/revenuecat). Direct App Store Server Notifications v2 (JWS)
//                and Play RTDN are not implemented: verify() answers 501 so nothing can be activated
//                through them by accident.

import {
  checkSepaySignature, parseSepayTransaction, sepayAuthMode, sepayAuthorized, sepayBankConfig, sepaySignature,
  sepaySourceAllowed, sepayTransferType,
} from '../sepay'
import type { IncomingNotification, PaymentProvider, VerifyResult } from './types'

export const sepayProvider: PaymentProvider = {
  id: 'sepay',
  configured: (env = process.env) =>
    !!(sepayAuthMode(env) === 'hmac' ? env.SEPAY_WEBHOOK_HMAC_SECRET?.trim() : env.SEPAY_WEBHOOK_API_KEY?.trim()) && sepayBankConfig(env) !== null,
  verify(n: IncomingNotification, env = process.env): VerifyResult {
    if (!sepaySourceAllowed(n.headers, env)) return { ok: false, status: 401, reason: 'source_not_allowed' }
    if (sepayAuthMode(env) === 'hmac') {
      const check = checkSepaySignature(n.rawBody, n.headers.get('x-sepay-signature'), n.headers.get('x-sepay-timestamp'), env)
      if (check !== 'ok') return { ok: false, status: 401, reason: check }
    } else if (!sepayAuthorized(n.headers.get('authorization'), env)) {
      return { ok: false, status: 401, reason: 'unauthorized' }
    }
    let body: unknown = null
    try { body = JSON.parse(n.rawBody) } catch { body = null }
    const tx = parseSepayTransaction(body)
    if (!tx) return { ok: false, status: 400, reason: 'invalid_payload' }
    return {
      ok: true,
      event: {
        kind: 'bank_transfer',
        providerTxId: tx.id,
        orderCode: tx.code,
        amountVnd: tx.transferAmount,
        direction: sepayTransferType(tx, sepayBankConfig(env)?.accountNumber ?? null) as 'in' | 'out' | 'other_account',
        // No transfer content or payer name: code + bank reference are enough to reconcile.
        summary: { gateway: tx.gateway, transactionDate: tx.transactionDate, referenceCode: tx.referenceCode, code: tx.code },
      },
    }
  },
}

const storeSkeleton = (id: 'app_store' | 'google_play'): PaymentProvider => ({
  id,
  configured: () => false,
  verify: () => ({ ok: false, status: 501, reason: 'not_implemented_use_revenuecat' }),
})
export const appStoreProvider = storeSkeleton('app_store')
export const googlePlayProvider = storeSkeleton('google_play')

/** True on any production deployment — the fake bank must not exist there. */
export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
}

export class FakeBankRefused extends Error {
  constructor() { super('fake bank is test-only'); this.name = 'FakeBankRefused' }
}

/**
 * TEST ONLY. A bank that "sends" SePay webhooks. It knows the configured webhook key (a test key in
 * tests) and the receiving account, so what it produces passes the REAL `sepayProvider.verify` — the
 * point is to exercise verification and the database decision, not to bypass them.
 */
let fakeSeq = 900_000_000 // module-wide: two fake banks never reuse a transaction id

export function fakeBank(env: NodeJS.ProcessEnv = process.env) {
  if (isProductionRuntime(env)) throw new FakeBankRefused()
  return {
    /**
     * A SePay-shaped transfer, authenticated the way the configured mode expects: HMAC over the exact
     * raw body (default) or the Apikey header. `at` = signing time in ms (tests: stale timestamps).
     */
    transfer(code: string | null, amountVnd: number, over: Record<string, unknown> = {}, at: number = Date.now()):
      { headers: Headers; body: Record<string, unknown>; rawBody: string } {
      const body: Record<string, unknown> = {
        id: ++fakeSeq, gateway: 'FakeBank', transactionDate: '2026-10-01 10:00:00',
        accountNumber: sepayBankConfig(env)?.accountNumber ?? null, subAccount: '', code, content: code ?? 'no code',
        transferType: 'in', transferAmount: amountVnd, accumulated: 0, referenceCode: `FAKE${fakeSeq}`, description: '',
        ...over,
      }
      const rawBody = JSON.stringify(body)
      const headers = new Headers({ 'content-type': 'application/json' })
      if (sepayAuthMode(env) === 'hmac') {
        const ts = String(Math.floor(at / 1000))
        headers.set('x-sepay-timestamp', ts)
        headers.set('x-sepay-signature', sepaySignature(env.SEPAY_WEBHOOK_HMAC_SECRET?.trim() ?? '', ts, rawBody))
      } else {
        headers.set('authorization', `Apikey ${env.SEPAY_WEBHOOK_API_KEY?.trim() ?? ''}`)
      }
      return { headers, body, rawBody }
    },
  }
}
