import { afterEach, describe, it, expect } from 'vitest'
import { COMMERCE_EVENT_FIELDS, emitCommerceEvent, sanitizeCommerceEvent, setCommerceEventWriter } from './sink'

describe('CCP audit events (D5 — server sink, no PII, no raw URL)', () => {
  afterEach(() => setCommerceEventWriter(null))

  it('writes structured entries with severity and component', () => {
    const seen: Record<string, unknown>[] = []
    setCommerceEventWriter(e => seen.push(e))
    emitCommerceEvent({ type: 'commerce_handoff', linkId: 'abc', requestId: 'r1', platform: 'web' }, new Date('2026-09-13T10:00:00Z'))
    expect(seen[0]).toMatchObject({ type: 'commerce_handoff', component: 'ccp', severity: 'INFO', ts: '2026-09-13T10:00:00.000Z' })
  })

  it('drops fields outside the allow-list and values that look like PII or URLs', () => {
    const out = sanitizeCommerceEvent({
      type: 'provider_search',
      requestId: 'r1',
      providerId: 'pasgo',
      offersCount: 1,
      latencyMs: 3,
      errorCode: 'user@example.com',
      // @ts-expect-error — unknown field must be stripped, not typed in
      rawUrl: 'https://pasgo.vn/dat-cho-ngay/4815',
    })
    expect(out).toEqual({ type: 'provider_search', requestId: 'r1', providerId: 'pasgo', offersCount: 1, latencyMs: 3 })
    expect(COMMERCE_EVENT_FIELDS.has('url')).toBe(false)
    expect(COMMERCE_EVENT_FIELDS.has('email')).toBe(false)
  })

  it('never throws even if the writer does', () => {
    setCommerceEventWriter(() => { throw new Error('sink down') })
    expect(() => emitCommerceEvent({ type: 'commerce_handoff', linkId: 'x', requestId: 'y' })).not.toThrow()
  })
})
