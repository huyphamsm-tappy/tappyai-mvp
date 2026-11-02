import { createHmac } from 'node:crypto'

// Tappy Business — purpose-scoped keys derived from one secret.
//
// P2.1 needs two keys: one to derive a phone rate-limit identity without
// storing a searchable phone number, and one to encrypt the tracking token
// while it sits in the 24-hour idempotency record.
//
// They come from ONE environment variable rather than two, because three
// separate secrets (with Turnstile) is three things to rotate, three to get
// wrong in a preview environment, and three chances for one of them to be
// quietly unset. Deriving with an HMAC over a purpose label is the standard way
// to get independent keys from one input: knowing the phone key tells you
// nothing about the encryption key, and neither reveals the root.
//
// 🚨 FAIL CLOSED. A missing secret is not a reason to skip the control — it is
// a reason to refuse the request. Silently degrading to an unkeyed hash would
// make the phone identity guessable by anyone who can hash a phone number.

const ENV = 'TAPPY_BUSINESS_SECRET'

export class BusinessSecretMissingError extends Error {
  constructor() {
    super(`${ENV} is not configured`)
    this.name = 'BusinessSecretMissingError'
  }
}

/** Labels are fixed strings; a typo would silently produce a different key. */
export type KeyPurpose = 'phone-rate-limit' | 'idempotency-encryption'

function root(): string {
  const value = process.env[ENV]
  if (!value || value.length < 32) throw new BusinessSecretMissingError()
  return value
}

/** True when the capability can operate. Routes use this to fail closed early. */
export function businessSecretConfigured(): boolean {
  const value = process.env[ENV]
  return typeof value === 'string' && value.length >= 32
}

/** A 32-byte key for one purpose, independent of every other purpose. */
export function deriveKey(purpose: KeyPurpose): Buffer {
  return createHmac('sha256', root()).update(purpose).digest()
}
