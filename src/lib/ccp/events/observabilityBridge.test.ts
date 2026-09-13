import { describe, it, expect, afterEach } from 'vitest'
import { toObservabilityEvent, installCommerceObservability, __resetCommerceObservability } from './observabilityBridge'
import { emitCommerceEvent, sanitizeCommerceEvent } from './sink'
import { resolveCommerce } from '..'
import { ALLOWED_PAYLOAD_KEYS, EVENT_TYPES, sanitizePayload, type ObservabilityEvent } from '@/lib/observability/events'

// ── CCP events → shared observability (owner decision P6-C) ─────────────────

afterEach(() => __resetCommerceObservability())

const COMMERCE_TYPES = ['commerce_request', 'commerce_provider_search', 'commerce_provider_selected', 'commerce_deep_link_resolved', 'commerce_deep_link_validated', 'commerce_handoff']

describe('the six approved commerce events exist in the shared vocabulary', () => {
  it('and nothing more', () => {
    const declared = EVENT_TYPES.filter(t => t.startsWith('commerce_'))
    expect(declared.sort()).toEqual([...COMMERCE_TYPES].sort())
  })
})

describe('bridge translation', () => {
  it('maps every CCP event a real resolution emits into an allow-listed, scalar-only event with no URL', () => {
    const seen: ObservabilityEvent[] = []
    installCommerceObservability(e => seen.push(e))
    const r = resolveCommerce(
      { domain: 'travel', intentType: 'book_hotel', subject: 'Mường Thanh', configuration: { kind: 'hotel', propertyRef: 'x', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 }, context: { platform: 'web' } },
      { enabled: true, hints: [{ subjectRef: '10569789' }], now: new Date('2026-09-13T08:00:00Z') },
    )
    expect('links' in r && r.links).toHaveLength(1)
    const types = seen.map(e => e.type)
    expect(types).toEqual(['commerce_request', 'commerce_provider_search', 'commerce_deep_link_resolved', 'commerce_deep_link_validated', 'commerce_provider_selected'])
    for (const e of seen) {
      const payload = sanitizePayload(e)
      // Nothing was dropped by the shared sanitiser: every field is allow-listed and scalar.
      expect(Object.keys(payload).sort(), e.type).toEqual(Object.keys(e).filter(k => (e as unknown as Record<string, unknown>)[k] !== undefined).sort())
      for (const k of Object.keys(e)) expect(ALLOWED_PAYLOAD_KEYS.has(k), `${e.type}.${k}`).toBe(true)
      expect(JSON.stringify(e)).not.toMatch(/https?:\/\//)
      expect(JSON.stringify(e)).not.toContain('Mường Thanh')
    }
    const resolved = seen.find(e => e.type === 'commerce_deep_link_resolved')!
    expect(resolved).toMatchObject({ providerId: 'tripcom', kind: 'DIRECT_DEEP_LINK', depth: 4, guestDepth: 5, authRequiredAt: 'none', freshnessType: 'static', trackingPresent: false })
    expect((resolved as { paramsPreserved: string }).paramsPreserved).toBe('propertyRef,checkIn,checkOut,adults,children,rooms')
    expect((resolved as { linkDigest: string }).linkDigest).toMatch(/^[a-f0-9]{16}$/)
    const request = seen.find(e => e.type === 'commerce_request')!
    expect((request as { configurationFields: string }).configurationFields).toBe('propertyRef,checkIn,checkOut,adults')
    expect((request as { platform?: string }).platform).toBe('web')
  })

  it('the handoff event maps with its opaque ids only', () => {
    const e = toObservabilityEvent({ type: 'commerce_handoff', linkId: 'c'.repeat(24), requestId: '550e8400-e29b-41d4-a716-446655440000', platform: 'web' })
    expect(e).toEqual({ type: 'commerce_handoff', linkId: 'c'.repeat(24), requestId: '550e8400-e29b-41d4-a716-446655440000', platform: 'web' })
  })

  it('a validation detail becomes `reason`; features are dropped; unknown types are null', () => {
    expect(toObservabilityEvent({ type: 'deep_link_validated', linkId: 'x', status: 'wrapper_rejected', method: 'decode', ms: 2, detail: 'param_echo_failed: hotelId' }))
      .toEqual({ type: 'commerce_deep_link_validated', linkId: 'x', status: 'wrapper_rejected', method: 'decode', ms: 2, reason: 'param_echo_failed: hotelId' })
    const sel = toObservabilityEvent({ type: 'provider_selected', requestId: 'r', providerId: 'p', merchantId: 'm', score: 0.5, rankingVersion: 'v1', features: { depth: 1 } })
    expect(sel && 'features' in sel).toBe(false)
    expect(toObservabilityEvent({ type: 'tappyai_usage' })).toBeNull()
    expect(toObservabilityEvent({})).toBeNull()
  })

  it('a UUID whose last group is all digits keeps its correlation key through the CCP sanitiser', () => {
    const out = sanitizeCommerceEvent({ type: 'commerce_handoff', linkId: '1'.repeat(24), requestId: '550e8400-e29b-41d4-a716-446655440000' })
    expect(out.requestId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(out.linkId).toBe('1'.repeat(24))
    // …while a phone number or URL in any other string field is still refused.
    const leak = sanitizeCommerceEvent({ type: 'provider_search', requestId: 'r', providerId: 'call +84 912 345 678', offersCount: 0, latencyMs: 1 })
    expect(leak.providerId).toBeUndefined()
  })

  it('installing the bridge routes emitCommerceEvent; nothing goes to user_events', () => {
    const seen: ObservabilityEvent[] = []
    installCommerceObservability(e => seen.push(e))
    emitCommerceEvent({ type: 'commerce_handoff', linkId: 'a'.repeat(24), requestId: '550e8400-e29b-41d4-a716-446655440000' })
    expect(seen).toHaveLength(1)
    expect(seen[0].type).toBe('commerce_handoff')
  })
})
