import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { deriveKey } from './secrets'

// Tappy Business — create-order idempotency.
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
// The customer is on 4G, in an in-app browser, tapping a button. A retried
// request must not become a second order — the merchant would see two, and the
// customer would be asked to pay twice.
//
// ============================================================================
// 🔑 WHY THE RECORD LIVES IN REDIS AND NOT IN POSTGRESQL
// ============================================================================
// A replay has to return the SAME tracking URL, which means the raw token. P0
// §21 forbids the raw token from ever being stored permanently in PostgreSQL —
// the database holds only its SHA-256 — so the replay material cannot live
// there. It lives in Redis with a 24-hour TTL, encrypted with a key derived
// from the Business secret, and expires on its own.
//
// So the token exists in exactly three places: the customer's URL bar, the
// response we just sent, and this record for 24 hours. Never in Postgres.
//
// ============================================================================
// SAME KEY, DIFFERENT REQUEST
// ============================================================================
// An idempotency key is a promise about ONE request. If the same key arrives
// with a different body, honouring it would return an order the caller did not
// ask for — so the record carries a fingerprint of the request and a mismatch
// is a deterministic 422. That is a client bug, and it should look like one.

const TTL_SECONDS = 24 * 60 * 60
const PREFIX = 'tb:idem:'

interface CacheClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<unknown>
}

let redis: CacheClient | null = null
let override: CacheClient | null = null

/** Test seam, following src/lib/security/distributedRateLimit.ts. */
export function __setIdempotencyStore(next: CacheClient | null): void {
  override = next
}
export function __resetIdempotencyStore(): void {
  override = null
  redis = null
}

async function store(): Promise<CacheClient | null> {
  if (override) return override
  if (redis) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const { Redis } = await import('@upstash/redis')
    redis = new Redis({ url, token }) as unknown as CacheClient
    return redis
  } catch {
    return null
  }
}

/** The stored response, replayed verbatim on a retry. */
export interface IdempotentOrderResult {
  orderPublicId: string
  trackingToken: string
  status: string
  totalAmount: number
  totalItems: number
  currency: string
  expiresAt: string
}

interface Record_ {
  fingerprint: string
  result: IdempotentOrderResult
}

/**
 * A stable digest of what the caller asked for.
 *
 * Only the fields that decide the order are included. The Turnstile token is
 * excluded on purpose: it is single-use, so a legitimate retry carries a
 * different one and comparing it would turn every retry into a conflict.
 */
export function requestFingerprint(input: {
  productPublicId: string
  quantity: number
  selectedOptions: unknown
  customerName: string
  customerPhone: string
  customerAddress: string
  customerNote?: string | null
}): string {
  const canonical = JSON.stringify([
    input.productPublicId,
    input.quantity,
    input.selectedOptions ?? [],
    input.customerName,
    input.customerPhone,
    input.customerAddress,
    input.customerNote ?? null,
  ])
  return createHash('sha256').update(canonical).digest('base64url')
}

// AES-256-GCM: the record holds a bearer credential, and GCM detects tampering
// as well as hiding the value. iv:tag:ciphertext, all base64url.
function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey('idempotency-encryption'), iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

function decrypt(payload: string): string | null {
  const [iv, tag, body] = payload.split('.')
  if (!iv || !tag || !body) return null
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey('idempotency-encryption'),
      Buffer.from(iv, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // A tampered or key-rotated record is treated as absent rather than
    // trusted. The caller then creates a new order, which is the safe direction.
    return null
  }
}

const cacheKey = (key: string) => `${PREFIX}${createHash('sha256').update(key).digest('base64url')}`

export type IdempotencyLookup =
  | { readonly state: 'miss' }
  | { readonly state: 'replay'; readonly result: IdempotentOrderResult }
  | { readonly state: 'conflict' }
  /** Redis unavailable. The caller must fail closed, not proceed unprotected. */
  | { readonly state: 'unavailable' }

export async function lookup(key: string, fingerprint: string): Promise<IdempotencyLookup> {
  const client = await store()
  if (!client) return { state: 'unavailable' }

  let raw: string | null
  try {
    raw = await client.get(cacheKey(key))
  } catch {
    return { state: 'unavailable' }
  }
  if (!raw) return { state: 'miss' }

  const plain = decrypt(raw)
  if (!plain) return { state: 'miss' }

  let record: Record_
  try {
    record = JSON.parse(plain) as Record_
  } catch {
    return { state: 'miss' }
  }

  if (record.fingerprint !== fingerprint) return { state: 'conflict' }
  return { state: 'replay', result: record.result }
}

/** Store the outcome so a retry within 24h replays it. Best effort by design:
 *  a failure here loses the replay, never the order that was already written. */
export async function remember(
  key: string,
  fingerprint: string,
  result: IdempotentOrderResult
): Promise<void> {
  const client = await store()
  if (!client) return
  try {
    const record: Record_ = { fingerprint, result }
    await client.set(cacheKey(key), encrypt(JSON.stringify(record)), { ex: TTL_SECONDS })
  } catch {
    /* the order exists; only the replay convenience is lost */
  }
}
