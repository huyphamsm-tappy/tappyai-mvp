// SUBSCRIPTIONS — the payment-provider ADAPTER (docs/payments/PLAN.md). Written by the security
// session (p8/subscriptions).
//
// Every way money can arrive goes through one of these. The contract is the safety rule:
//   1. the SERVER creates the order (plan + price from PLAN_CONFIG) before any payment;
//   2. a plan is activated ONLY from a notification the adapter VERIFIED (signature/secret), whose
//      amount and order the database then matches against the server-created order;
//   3. a client saying "success" activates nothing (there is no such input anywhere);
//   4. replays are harmless: the provider's transaction/event id is the idempotency key.
// Real gateways are written only behind this interface, and only after the FAKE one has tests.

export type ProviderId = 'sepay' | 'fake_bank' | 'app_store' | 'google_play'

export interface IncomingNotification {
  headers: Headers
  /** The RAW request body exactly as received - HMAC signatures are over these bytes. */
  rawBody: string
}

/** A verified bank credit for a web order (SePay shape). Amount in VND. */
export interface VerifiedTransfer {
  kind: 'bank_transfer'
  providerTxId: number
  orderCode: string | null
  amountVnd: number
  direction: 'in' | 'out' | 'other_account'
  summary: Record<string, string | null>
}

export type VerifyResult =
  | { ok: true; event: VerifiedTransfer }
  | { ok: false; status: 400 | 401 | 501; reason: string }

export interface PaymentProvider {
  id: ProviderId
  /** False when its configuration is missing — then the route refuses (fail closed). */
  configured(env?: NodeJS.ProcessEnv): boolean
  verify(n: IncomingNotification, env?: NodeJS.ProcessEnv): VerifyResult
}
