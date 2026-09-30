import type { JWSTransaction } from './types'

// ── A genuine Apple signature is not a TappyAI purchase (security audit 2026-09-30) ─────────────
//
// jws.ts proves a payload was signed by Apple's App Store. It says nothing about WHICH app, WHICH
// environment or WHICH product: every app's transactions — including free Sandbox/TestFlight
// purchases of an attacker's own app — carry the same valid signature. POST /api/iap/apple/verify
// falls back to the client-sent JWS whenever the App Store Server API lookup fails, and a made-up
// originalTransactionId makes it fail (404), so before this check any Apple-signed transaction
// from any app granted Pro.

/** Auto-renewable products that grant Pro. Mirrors ios/TappyAI/Core/Payments/ProductCatalog.swift. */
export const APPLE_PRO_PRODUCT_IDS: readonly string[] = ['com.tappyai.ios.pro.monthly']

export function expectedAppleBundleId(env: NodeJS.ProcessEnv = process.env): string {
  return env.APPLE_IAP_BUNDLE_ID?.trim() || 'com.tappyai.ios'
}

/** Production unless the deployment is explicitly configured for Sandbox (APPLE_IAP_ENV). */
export function expectedAppleEnvironment(env: NodeJS.ProcessEnv = process.env): 'Production' | 'Sandbox' {
  return env.APPLE_IAP_ENV === 'Sandbox' ? 'Sandbox' : 'Production'
}

export type AppleTransactionRefusal =
  | 'wrong_bundle'
  | 'wrong_environment'
  | 'unknown_product'
  | 'transaction_mismatch'
  | 'revoked'

/**
 * Null when this verified transaction is a TappyAI Pro subscription for this deployment's
 * environment; otherwise why not. `originalTransactionId`, when given, must be the one the caller
 * claimed — a JWS for some other subscription cannot stand in for it.
 */
export function checkAppleTransaction(
  tx: Pick<JWSTransaction, 'bundleId' | 'environment' | 'productId' | 'originalTransactionId' | 'revocationDate'>,
  opts: { originalTransactionId?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): AppleTransactionRefusal | null {
  if (tx.bundleId !== expectedAppleBundleId(env)) return 'wrong_bundle'
  if (tx.environment !== expectedAppleEnvironment(env)) return 'wrong_environment'
  if (!APPLE_PRO_PRODUCT_IDS.includes(tx.productId)) return 'unknown_product'
  if (opts.originalTransactionId !== undefined && String(tx.originalTransactionId) !== String(opts.originalTransactionId)) return 'transaction_mismatch'
  if (tx.revocationDate) return 'revoked'
  return null
}

/** The same bundle/environment rule for a notification's envelope (`data`). */
export function checkAppleNotificationEnvelope(
  data: { bundleId?: string; environment?: string } | undefined,
  env: NodeJS.ProcessEnv = process.env,
): 'wrong_bundle' | 'wrong_environment' | null {
  if (data?.bundleId !== expectedAppleBundleId(env)) return 'wrong_bundle'
  if (data?.environment !== expectedAppleEnvironment(env)) return 'wrong_environment'
  return null
}
