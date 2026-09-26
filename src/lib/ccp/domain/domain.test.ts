import { describe, it, expect } from 'vitest'
import { parseCommerceRequest } from './request'
import { decayConfidence, isExpired, makeFreshness, nextFeedRegeneration } from './freshness'
import { COMMERCE_DOMAINS, DOMAIN_INTENTS, INTENT_TYPES, LINK_KINDS } from './types'

describe('CommerceRequest validation', () => {
  it('accepts a well-formed hotel request', () => {
    const r = parseCommerceRequest({
      domain: 'travel',
      intentType: 'book_hotel',
      subject: 'Nordic Resort',
      configuration: { kind: 'hotel', propertyRef: '10569789', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects an intent that does not belong to the domain', () => {
    const r = parseCommerceRequest({ domain: 'spa', intentType: 'book_hotel', subject: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.join()).toMatch(/intentType/)
  })

  it('rejects check-out on or before check-in', () => {
    const r = parseCommerceRequest({
      domain: 'travel',
      intentType: 'book_hotel',
      subject: 'x',
      configuration: { kind: 'hotel', propertyRef: '1', checkIn: '2026-10-12', checkOut: '2026-10-12', adults: 2 },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects control characters and whitespace in provider refs (injection surface)', () => {
    for (const bad of ['123 456', 'abc\n', 'x\x00y', ' lead']) {
      const r = parseCommerceRequest({ domain: 'shopping', intentType: 'buy_product', subject: 'x', configuration: { kind: 'shopping', productRef: bad } })
      expect(r.ok, bad).toBe(false)
    }
  })

  it('rejects malformed times, oversized parties and raw actor ids', () => {
    expect(parseCommerceRequest({ domain: 'food_drink', intentType: 'reserve_table', subject: 'x', configuration: { kind: 'reservation', restaurantRef: '4815', date: '2026-09-13', time: '25:00', adults: 2 } }).ok).toBe(false)
    expect(parseCommerceRequest({ domain: 'food_drink', intentType: 'reserve_table', subject: 'x', configuration: { kind: 'reservation', restaurantRef: '4815', date: '2026-09-13', time: '19:00', adults: 99 } }).ok).toBe(false)
    expect(parseCommerceRequest({ domain: 'shopping', intentType: 'buy_product', subject: 'x', context: { actorHash: 'user@example.com' } }).ok).toBe(false)
  })

  it('every intent belongs to exactly one domain and the enums are closed', () => {
    const all = Object.values(DOMAIN_INTENTS).flat()
    expect(new Set(all).size).toBe(all.length)
    expect(all.sort()).toEqual([...INTENT_TYPES].sort())
    expect(COMMERCE_DOMAINS).toHaveLength(5)
    expect(LINK_KINDS).toHaveLength(7)
  })
})

describe('freshness contract', () => {
  const now = new Date('2026-09-13T10:00:00Z')

  it('stamps retrievedAt/expiresAt from a TTL policy and never exceeds confidence 1', () => {
    const f = makeFreshness('feed:x.csv', { freshnessType: 'near_realtime', ttlMs: 3_600_000 }, { now, confidence: 4 })
    expect(f.retrievedAt).toBe(now.toISOString())
    expect(f.expiresAt).toBe(new Date(now.getTime() + 3_600_000).toISOString())
    expect(f.confidence).toBe(1)
    expect(isExpired(f, new Date(now.getTime() + 3_600_001))).toBe(true)
    expect(isExpired(f, now)).toBe(false)
  })

  it('a null TTL never expires (identity data) and static is never relabelled', () => {
    const f = makeFreshness('registry:x', { freshnessType: 'static', ttlMs: null }, { now, confidence: 1 })
    expect(f.expiresAt).toBeNull()
    expect(f.freshnessType).toBe('static')
    expect(isExpired(f, new Date('2030-01-01'))).toBe(false)
  })

  it('confidence decays only after the 30-day re-verification window', () => {
    expect(decayConfidence(1, '2026-09-13', new Date('2026-10-01'))).toBe(1)
    expect(decayConfidence(1, '2026-09-13', new Date('2026-11-13'))).toBeLessThan(1)
    expect(decayConfidence(1, '2026-09-13', new Date('2027-01-13'))).toBeCloseTo(0.4, 5)
    expect(decayConfidence(1, 'not-a-date')).toBe(0.5)
  })

  it('next feed regeneration is the next 00:08 UTC plus grace', () => {
    expect(nextFeedRegeneration(new Date('2026-09-13T01:00:00Z'), 0).toISOString()).toBe('2026-09-14T00:08:00.000Z')
    expect(nextFeedRegeneration(new Date('2026-09-13T00:05:00Z'), 0).toISOString()).toBe('2026-09-13T00:08:00.000Z')
  })
})
