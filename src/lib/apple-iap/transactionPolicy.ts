import type { JWSTransaction } from './types'
import { PLAN_CONFIG, PAID_PLAN_IDS, planForStoreProduct, type PaidPlanId } from '@/lib/plans/planConfig'

// ── A genuine Apple signature is not a TappyAI purchase (security audit 2026-09-30) ─────────────
//
// jws.ts proves a payload was signed by Apple's App Store. It says nothing about WHICH app, WHICH
// environment or WHICH product: every app's transactions — including free Sandbox/TestFlight
// purchases of an attacker's own app — carry the same valid signature. POST /api/iap/apple/verify
// falls back to the client-sent JWS whenever the App Store Server API lookup fails, and a made-up
// originalTransactionId makes it fail (404), so before this check any Apple-signed transaction
// from any app granted Pro.

/** Auto-renewable products that grant Pro. Mirrors ios/TappyAI/Core/Payments/ProductCatalog.swift. */
export const APPLE_PRO_PRODUCT_IDS: readonly string[] = [
  'com.tappyai.ios.pro.monthly',
  ...PAID_PLAN_IDS.map((id) => PLAN_CONFIG[id].storeProductId!).filter(Boolean),
]

export function expectedAppleBundleId(env: NodeJS.ProcessEnv = process.env): string {
  return env.APPLE_IAP_BUNDLE_ID?.trim() || 'com.tappyai.ios'
}

/**
 * Helper to determine if Apple Sandbox environment is allowed.
 *
 * Opt-in flag, default OFF:
 * - Sandbox is only accepted when APPLE_IAP_ALLOW_SANDBOX is explicitly configured to '1' or 'true',
 *   or when the deployment is explicitly configured for Sandbox-only (APPLE_IAP_ENV === 'Sandbox').
 * - Otherwise (flag missing, '0', 'false', undefined), returns false (Production only).
 */
export function isAppleSandboxAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APPLE_IAP_ENV === 'Sandbox') return true
  const val = env.APPLE_IAP_ALLOW_SANDBOX?.trim().toLowerCase()
  return val === '1' || val === 'true'
}

/**
 * Accepted environments for Apple transactions and server notifications.
 *
 * Production is ALWAYS accepted (unless deployment is explicitly Sandbox-only via APPLE_IAP_ENV).
 * Sandbox is ONLY accepted when APPLE_IAP_ALLOW_SANDBOX is explicitly enabled ('1' | 'true') or APPLE_IAP_ENV === 'Sandbox'.
 * Default: Production only (opt-in Sandbox).
 */
export function allowedAppleEnvironments(env: NodeJS.ProcessEnv = process.env): readonly ('Production' | 'Sandbox')[] {
  if (env.APPLE_IAP_ENV === 'Sandbox') return ['Sandbox']
  if (isAppleSandboxAllowed(env)) return ['Production', 'Sandbox']
  return ['Production']
}

/** Production unless the deployment is explicitly configured for Sandbox (APPLE_IAP_ENV). */
export function expectedAppleEnvironment(env: NodeJS.ProcessEnv = process.env): 'Production' | 'Sandbox' {
  return env.APPLE_IAP_ENV === 'Sandbox' ? 'Sandbox' : 'Production'
}

export type AppleTransactionRefusal =
  | 'wrong_bundle'
  | 'wrong_environment'
  | 'unknown_product'
  | 'product_mismatch'
  | 'transaction_mismatch'
  | 'revoked'

/**
 * Null when this verified transaction is a TappyAI Pro subscription for this deployment's
 * environment; otherwise why not. `originalTransactionId`, when given, must be the one the caller
 * claimed — a JWS for some other subscription cannot stand in for it.
 * `expectedProductId`, when given, must match `tx.productId` — client cannot claim a different product.
 */
export function checkAppleTransaction(
  tx: Pick<JWSTransaction, 'bundleId' | 'environment' | 'productId' | 'originalTransactionId' | 'revocationDate'> & { appAccountToken?: string },
  opts: { originalTransactionId?: string; appAccountToken?: string; expectedProductId?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): AppleTransactionRefusal | null {
  if (tx.bundleId !== expectedAppleBundleId(env)) return 'wrong_bundle'
  if (!allowedAppleEnvironments(env).includes(tx.environment as 'Production' | 'Sandbox')) return 'wrong_environment'
  if (!APPLE_PRO_PRODUCT_IDS.includes(tx.productId)) return 'unknown_product'
  if (opts.expectedProductId !== undefined && tx.productId !== opts.expectedProductId) return 'product_mismatch'
  if (opts.originalTransactionId !== undefined && String(tx.originalTransactionId) !== String(opts.originalTransactionId)) return 'transaction_mismatch'
  if (opts.appAccountToken && tx.appAccountToken && tx.appAccountToken.toLowerCase() !== opts.appAccountToken.toLowerCase()) return 'transaction_mismatch'
  if (tx.revocationDate) return 'revoked'
  return null
}

/** The same bundle/environment rule for a notification's envelope (`data`). */
export function checkAppleNotificationEnvelope(
  data: { bundleId?: string; environment?: string } | undefined,
  env: NodeJS.ProcessEnv = process.env,
): 'wrong_bundle' | 'wrong_environment' | null {
  if (data?.bundleId !== expectedAppleBundleId(env)) return 'wrong_bundle'
  if (!allowedAppleEnvironments(env).includes(data?.environment as 'Production' | 'Sandbox')) return 'wrong_environment'
  return null
}

/**
 * Maps an approved Apple Store product ID to its canonical paid plan.
 * Returns null for any unapproved or unknown product.
 */
export function applePlanForProduct(productId: string | null | undefined): PaidPlanId | null {
  if (!productId) return null
  const base = productId.split(':')[0]
  if (base === 'com.tappyai.ios.pro.monthly') return 'momo'
  return planForStoreProduct(base)
}

/** The columns `keepsLongerExternalPlan` reads from the account's current `subscriptions` row. */
export interface ExistingPlanRow {
  status?: string | null
  current_period_end?: string | null
  source?: string | null
  stripe_sub_id?: string | null
}

/**
 * True when the account already holds an ACTIVE plan that did not come from the App Store and that lasts longer
 * than the App Store period being recorded (`incomingEnd`; null = no usable App Store period). `subscriptions`
 * has one row per account, so recording the App Store plan would replace that plan, or mark it expired.
 * A row that is itself an App Store row (renewal, or a second device) is never kept: it is the normal update.
 */
export function keepsLongerExternalPlan(
  existing: ExistingPlanRow | null | undefined,
  incomingEnd: Date | null,
  now: Date = new Date(),
): boolean {
  if (!existing || existing.status !== 'active' || !existing.current_period_end) return false
  if (existing.source === 'apple_iap' || String(existing.stripe_sub_id ?? '').startsWith('apple_')) return false
  const end = new Date(existing.current_period_end)
  if (Number.isNaN(end.getTime()) || end <= now) return false
  return incomingEnd === null || end > incomingEnd
}
