import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  __resetIdempotencyStore,
  __setIdempotencyStore,
  lookup,
  remember,
  requestFingerprint,
  type IdempotentOrderResult,
} from './idempotency'

// Tappy Business — create-order idempotency.
//
// Two properties are load-bearing:
//
//   1. a retry must not become a second order, and must get the SAME tracking
//      URL back — the customer is on 4G in an in-app browser;
//   2. the raw tracking token must never be readable from the record, because
//      it is the entire access model for the order.

const SECRET = 'a'.repeat(48)
const original = process.env.TAPPY_BUSINESS_SECRET

/** An in-memory stand-in for Redis. Records what was actually written. */
function fakeStore() {
  const data = new Map<string, string>()
  return {
    data,
    get: async (k: string) => data.get(k) ?? null,
    set: async (k: string, v: string) => {
      data.set(k, v)
      return 'OK'
    },
  }
}

const RESULT: IdempotentOrderResult = {
  orderPublicId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  trackingToken: 'wKq3Z7xN1p2Q9rS4tU6vW8yA0bC2dE4fG6hJ8kL0mN2',
  status: 'PENDING',
  totalAmount: 90_000,
  totalItems: 2,
  currency: 'VND',
  expiresAt: '2026-09-11T00:00:00Z',
}

const REQUEST = {
  productPublicId: '01BX5ZZKBKACTAV9WEVGEMMVRZ',
  quantity: 2,
  selectedOptions: [{ group: 'Màu', value: 'Đỏ' }],
  customerName: 'Nguyễn Thị Lan',
  customerPhone: '0901234567',
  customerAddress: '128 Nguyễn Văn Cừ, Q5',
  customerNote: null,
}

let store: ReturnType<typeof fakeStore>

beforeEach(() => {
  process.env.TAPPY_BUSINESS_SECRET = SECRET
  store = fakeStore()
  __setIdempotencyStore(store)
})
afterEach(() => {
  __resetIdempotencyStore()
  if (original === undefined) delete process.env.TAPPY_BUSINESS_SECRET
  else process.env.TAPPY_BUSINESS_SECRET = original
})

describe('the fingerprint decides whether two requests are the same', () => {
  it('is stable for an identical request', () => {
    expect(requestFingerprint(REQUEST)).toBe(requestFingerprint(REQUEST))
  })

  it('changes when anything that decides the order changes', () => {
    const base = requestFingerprint(REQUEST)
    expect(requestFingerprint({ ...REQUEST, quantity: 3 })).not.toBe(base)
    expect(requestFingerprint({ ...REQUEST, customerAddress: 'somewhere else' })).not.toBe(base)
    expect(requestFingerprint({ ...REQUEST, customerPhone: '0900000000' })).not.toBe(base)
    expect(requestFingerprint({ ...REQUEST, selectedOptions: [] })).not.toBe(base)
  })
})

describe('replay', () => {
  it('🔑 a retry returns the ORIGINAL result, including the same tracking token', async () => {
    const fp = requestFingerprint(REQUEST)
    await remember('key-1', fp, RESULT)

    const again = await lookup('key-1', fp)
    expect(again.state).toBe('replay')
    if (again.state !== 'replay') return
    // A different token would mean a second order — the whole failure this
    // mechanism exists to prevent.
    expect(again.result).toEqual(RESULT)
    expect(again.result.trackingToken).toBe(RESULT.trackingToken)
  })

  it('an unseen key is a miss, so the order proceeds', async () => {
    expect((await lookup('never-used', requestFingerprint(REQUEST))).state).toBe('miss')
  })
})

describe('same key, different request', () => {
  it('🔑 is a conflict, never a replay', async () => {
    // Returning the stored order here would hand the caller an order they did
    // not ask for — a different address, a different quantity.
    await remember('key-2', requestFingerprint(REQUEST), RESULT)
    const conflict = await lookup('key-2', requestFingerprint({ ...REQUEST, quantity: 9 }))
    expect(conflict.state).toBe('conflict')
  })
})

describe('the stored record protects the token', () => {
  it('🔑 the raw token is not readable in the stored value', async () => {
    await remember('key-3', requestFingerprint(REQUEST), RESULT)
    const stored = [...store.data.values()][0]

    expect(stored).toBeDefined()
    expect(stored).not.toContain(RESULT.trackingToken)
    expect(stored).not.toContain(RESULT.orderPublicId)
    expect(stored).not.toContain('PENDING')
  })

  it('is stored under a hashed key, so the caller’s key is not readable either', async () => {
    await remember('customer-chosen-key-abc', requestFingerprint(REQUEST), RESULT)
    const [key] = [...store.data.keys()]
    expect(key).not.toContain('customer-chosen-key-abc')
    expect(key.startsWith('tb:idem:')).toBe(true)
  })

  it('🔑 a record encrypted under a different secret is treated as absent', async () => {
    // Key rotation, or a tampered record. Reading it would mean trusting a
    // value we cannot authenticate; creating a fresh order is the safe way to
    // be wrong.
    await remember('key-4', requestFingerprint(REQUEST), RESULT)
    process.env.TAPPY_BUSINESS_SECRET = 'b'.repeat(48)
    expect((await lookup('key-4', requestFingerprint(REQUEST))).state).toBe('miss')
  })

  it('🔑 a tampered ciphertext is rejected by the auth tag, not decoded', async () => {
    await remember('key-5', requestFingerprint(REQUEST), RESULT)
    const [k, v] = [...store.data.entries()][0]
    const [iv, tag, body] = v.split('.')
    // Flip a byte of the ciphertext. GCM must refuse it.
    store.data.set(k, [iv, tag, body.slice(0, -2) + (body.slice(-2) === 'AA' ? 'AB' : 'AA')].join('.'))
    expect((await lookup('key-5', requestFingerprint(REQUEST))).state).toBe('miss')
  })
})

describe('when Redis is unavailable', () => {
  it('🔑 reports unavailable so the caller can fail closed', async () => {
    // Proceeding would mean a public write endpoint with no duplicate
    // protection. The route turns this into a 503.
    __setIdempotencyStore(null)
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    expect((await lookup('key-6', requestFingerprint(REQUEST))).state).toBe('unavailable')
  })

  it('remember() never throws — the order already exists', async () => {
    __setIdempotencyStore({
      get: async () => null,
      set: async () => {
        throw new Error('redis down')
      },
    })
    // Losing the record costs a replay. Throwing here would cost the response
    // to an order that is already written.
    await expect(remember('key-7', 'fp', RESULT)).resolves.toBeUndefined()
  })
})
