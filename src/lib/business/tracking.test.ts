import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  hashTrackingToken,
  newTrackingToken,
  normalisePhone,
  phoneRateLimitKey,
  trackingUrl,
} from './tracking'
import { BusinessSecretMissingError } from './secrets'

// Tappy Business — the tracking token and the phone rate-limit identity.
//
// The token is the ENTIRE access model for an order. Nobody signs in to see
// one, so if it were guessable, derivable, or reused, an order's contents would
// be too. These tests are about that one property.

const SECRET = 'a'.repeat(48)
const original = process.env.TAPPY_BUSINESS_SECRET

beforeEach(() => {
  process.env.TAPPY_BUSINESS_SECRET = SECRET
})
afterEach(() => {
  if (original === undefined) delete process.env.TAPPY_BUSINESS_SECRET
  else process.env.TAPPY_BUSINESS_SECRET = original
})

describe('the tracking token', () => {
  it('is URL-safe base64 with no padding', () => {
    for (let i = 0; i < 200; i++) {
      expect(newTrackingToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('🔑 carries 256 bits — twice the contract floor of 128', () => {
    // 32 bytes → 43 base64url characters.
    expect(newTrackingToken()).toHaveLength(43)
  })

  it('🔑 never repeats across a large batch', () => {
    const tokens = new Set(Array.from({ length: 20_000 }, () => newTrackingToken()))
    expect(tokens.size).toBe(20_000)
  })

  it('🔑 is not derived from anything a third party could know', () => {
    // Two tokens minted in the same millisecond must share nothing. If the
    // token were seeded from the clock, the order id, or the phone number,
    // whoever knows that value could reconstruct the link — and the merchant,
    // the customer and anyone who saw the confirmation screen know the phone.
    const a = newTrackingToken()
    const b = newTrackingToken()
    expect(a).not.toBe(b)
    // No shared prefix beyond what chance allows.
    let shared = 0
    while (shared < a.length && a[shared] === b[shared]) shared++
    expect(shared).toBeLessThan(6)
  })

  it('hashes to exactly 32 bytes, matching the column CHECK', () => {
    const hash = hashTrackingToken(newTrackingToken())
    expect(hash).toBeInstanceOf(Buffer)
    expect(hash.length).toBe(32)
  })

  it('🔑 the hash is one-way — the stored value does not contain the token', () => {
    const token = newTrackingToken()
    const stored = hashTrackingToken(token).toString('base64url')
    expect(stored).not.toContain(token)
    expect(token).not.toContain(stored)
  })

  it('hashes deterministically, so a lookup is an index probe', () => {
    const token = newTrackingToken()
    expect(hashTrackingToken(token).equals(hashTrackingToken(token))).toBe(true)
    expect(hashTrackingToken(token).equals(hashTrackingToken(newTrackingToken()))).toBe(false)
  })

  it('builds the customer-facing URL', () => {
    const token = newTrackingToken()
    expect(trackingUrl(token)).toBe(`https://tappyai.com/order/${token}`)
    expect(trackingUrl(token, 'https://staging.example.com/')).toContain('staging.example.com/order/')
  })
})

describe('phone normalisation', () => {
  it('collapses the ways one Vietnamese number is written', () => {
    for (const written of ['0901234567', '090 123 4567', '+84901234567', '84 901 234 567']) {
      expect(normalisePhone(written), written).toBe('+84901234567')
    }
  })

  it('is lenient with an unfamiliar shape rather than refusing a sale', () => {
    expect(normalisePhone('+1 415 555 0100')).toBe('+14155550100')
  })
})

describe('the phone rate-limit identity', () => {
  it('is stable for one phone and different for another', () => {
    expect(phoneRateLimitKey('0901234567')).toBe(phoneRateLimitKey('090 123 4567'))
    expect(phoneRateLimitKey('0901234567')).not.toBe(phoneRateLimitKey('0901234568'))
  })

  it('🔑 does not contain the phone number in any form', () => {
    // The key goes into Redis. It must not be a place to read phone numbers.
    const key = phoneRateLimitKey('0901234567')
    expect(key).not.toContain('0901234567')
    expect(key).not.toContain('901234567')
    expect(key).not.toContain('84901234567')
  })

  it('🔑 is KEYED, so it cannot be reversed with a rainbow table', () => {
    // A phone number has ~10 decimal digits of entropy: an unkeyed digest of
    // every Vietnamese mobile is a table anyone can build. Changing the secret
    // must change the key — that is what proves the secret is actually mixed in.
    const withFirst = phoneRateLimitKey('0901234567')
    process.env.TAPPY_BUSINESS_SECRET = 'b'.repeat(48)
    expect(phoneRateLimitKey('0901234567')).not.toBe(withFirst)
  })

  it('🔑 fails closed when the secret is missing', () => {
    // Degrading to an unkeyed hash would silently make the identity guessable.
    delete process.env.TAPPY_BUSINESS_SECRET
    expect(() => phoneRateLimitKey('0901234567')).toThrow(BusinessSecretMissingError)
  })

  it('refuses a secret too short to be one', () => {
    process.env.TAPPY_BUSINESS_SECRET = 'short'
    expect(() => phoneRateLimitKey('0901234567')).toThrow(BusinessSecretMissingError)
  })

  it('is short enough to bound Redis memory', () => {
    expect(phoneRateLimitKey('0901234567')).toHaveLength(22)
  })
})
