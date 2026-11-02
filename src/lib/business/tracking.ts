import { createHash, createHmac, randomBytes } from 'node:crypto'
import { deriveKey } from './secrets'

// Tappy Business — the tracking token, and the phone rate-limit identity.
//
// ============================================================================
// 🔑 THE TOKEN IS A BEARER CREDENTIAL IN A URL THE CUSTOMER IS TOLD TO SHARE
// ============================================================================
// It is the whole of the access model for an order (P0 §21), so it is 256 bits
// of CSPRNG output and nothing else. Deriving it from the order id, the public
// id, the phone number or the clock would make it guessable by someone who
// knows any of those — and the phone number is known to whoever placed the
// order, the merchant, and anyone who saw the confirmation screen.
//
// PostgreSQL stores only `SHA-256(token)`. A plain digest rather than a
// password hash is correct here and the reason matters: the input is 256 random
// bits, so there is no dictionary to attack and no work factor worth paying —
// while the lookup happens on every page load and must stay an index probe.

const TOKEN_BYTES = 32 // 256 bits — the contract's floor is 128.

/** A new tracking token. URL-safe, no padding, no PII, not derived from anything. */
export function newTrackingToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/** What PostgreSQL stores. 32 bytes, matching the column's octet_length CHECK. */
export function hashTrackingToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

/** The tracking URL a customer receives. The only place the raw token appears. */
export function trackingUrl(token: string, origin = 'https://tappyai.com'): string {
  return `${origin.replace(/\/+$/, '')}/order/${token}`
}

// ============================================================================
// THE PHONE RATE-LIMIT IDENTITY
// ============================================================================
// §23 requires a per-phone limit and §16 forbids any mechanism that enumerates
// orders by phone. Those pull in opposite directions only if the limit is
// implemented as a query.
//
// It is not. The limiter counts against `HMAC(secret, normalised_phone)` in
// Redis. `business_orders.customer_phone` is never read, never indexed, and
// never compared — so the limit exists and the enumeration does not.
//
// The HMAC is keyed rather than a bare hash because a phone number has about
// ten decimal digits of entropy: an unkeyed digest of every Vietnamese mobile
// number is a table anyone can build in minutes, which would turn the rate-limit
// keyspace into a lookup for "has this person ordered".

/**
 * Digits only, with a leading `0` rewritten to Vietnam's country code, so the
 * same phone written three ways counts once. Deliberately lenient: this feeds a
 * rate-limit key, and rejecting an unusual-but-real number would refuse a sale.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D+/g, '')
  if (digits.startsWith('84')) return `+${digits}`
  if (digits.startsWith('0')) return `+84${digits.slice(1)}`
  return `+${digits}`
}

/** The opaque per-phone rate-limit key. Never stored, never logged. */
export function phoneRateLimitKey(rawPhone: string): string {
  const digest = createHmac('sha256', deriveKey('phone-rate-limit'))
    .update(normalisePhone(rawPhone))
    .digest('base64url')
  // Truncated: 128 bits is far beyond collision risk for a rate-limit bucket,
  // and a shorter key keeps Redis memory bounded.
  return digest.slice(0, 22)
}
