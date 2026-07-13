/**
 * App Store Server API client.
 * Authenticates with a short-lived ES256 JWT signed by the private key from
 * App Store Connect → Users and Access → Integrations → In-App Purchase.
 *
 * Required env vars:
 *   APPLE_IAP_ISSUER_ID   — Issuer ID from App Store Connect
 *   APPLE_IAP_KEY_ID      — Key ID for the .p8 private key
 *   APPLE_IAP_PRIVATE_KEY — Contents of the .p8 file (newlines as \n or literal)
 *   APPLE_IAP_BUNDLE_ID   — com.tappyai.ios  (defaults to this if unset)
 *   APPLE_IAP_ENV         — "Sandbox" | "Production"  (defaults to Production)
 */

import { SignJWT, importPKCS8 } from 'jose'

const PRODUCTION_BASE = 'https://api.storekit.itunes.apple.com'
const SANDBOX_BASE    = 'https://api.storekit-sandbox.itunes.apple.com'

export function isAppleIAPConfigured(): boolean {
  return !!(
    process.env.APPLE_IAP_ISSUER_ID &&
    process.env.APPLE_IAP_KEY_ID &&
    process.env.APPLE_IAP_PRIVATE_KEY
  )
}

function apiBase(): string {
  return process.env.APPLE_IAP_ENV === 'Sandbox' ? SANDBOX_BASE : PRODUCTION_BASE
}

async function makeAuthJWT(): Promise<string> {
  const issuerId    = process.env.APPLE_IAP_ISSUER_ID!
  const keyId       = process.env.APPLE_IAP_KEY_ID!
  const rawKey      = process.env.APPLE_IAP_PRIVATE_KEY!
  const bundleId    = process.env.APPLE_IAP_BUNDLE_ID ?? 'com.tappyai.ios'

  // Support both literal newlines and escaped \n (common in Vercel env vars)
  const pemKey = rawKey.replace(/\\n/g, '\n')
  const privateKey = await importPKCS8(pemKey, 'ES256')

  return new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuedAt()
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function appleGet<T>(path: string): Promise<T> {
  const jwt = await makeAuthJWT()
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    // Never cache — always fetch fresh entitlement data
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`App Store Server API ${res.status} at ${path}: ${body}`)
  }
  return res.json() as Promise<T>
}

// ── Response types ─────────────────────────────────────────────────────────

export interface LastTransaction {
  originalTransactionId: string
  /**
   * 1 = active
   * 2 = expired
   * 3 = billing retry (in-billing-retry grace period)
   * 4 = billing grace period
   * 5 = revoked
   */
  status: 1 | 2 | 3 | 4 | 5
  signedTransactionInfo: string
  signedRenewalInfo: string
}

export interface SubscriptionStatusResponse {
  bundleId: string
  environment: string
  data: Array<{
    subscriptionGroupIdentifier: string
    lastTransactions: LastTransaction[]
  }>
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * GET /inApps/v1/subscriptions/{originalTransactionId}
 * Returns the latest subscription status for all groups under this transaction.
 */
export async function getSubscriptionStatuses(
  originalTransactionId: string
): Promise<SubscriptionStatusResponse> {
  return appleGet(`/inApps/v1/subscriptions/${originalTransactionId}`)
}

/**
 * Returns true if any subscription group has status = active (1) or billing grace period (4).
 * Uses the App Store Server API as the authoritative source — never trusts client-provided data.
 */
export async function isSubscriptionActive(originalTransactionId: string): Promise<boolean> {
  const response = await getSubscriptionStatuses(originalTransactionId)
  return response.data.some(group =>
    group.lastTransactions.some(tx => tx.status === 1 || tx.status === 4)
  )
}
