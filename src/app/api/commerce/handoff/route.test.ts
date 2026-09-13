import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── POST /api/commerce/handoff — the sixth CCP event, best-effort ────────────
//
// `CCP_ENABLED` is mocked per describe: the route acknowledges a well-formed
// body either way (never blocks a link) and emits only while the platform is on.

const flags = vi.hoisted(() => ({ CCP_ENABLED: false }))
vi.mock('@/lib/config/product', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, get CCP_ENABLED() { return flags.CCP_ENABLED } }
})

import { POST, parseHandoffBody } from './route'
import { setCommerceEventWriter } from '@/lib/ccp'

const LINK = 'a'.repeat(24)
const REQ = '550e8400-e29b-41d4-a716-446655440000'
const post = (body: unknown, ip = '203.0.113.7') => POST(new Request('http://localhost/api/commerce/handoff', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}))

let written: Record<string, unknown>[]
beforeEach(() => { written = []; setCommerceEventWriter(e => written.push(e)); flags.CCP_ENABLED = false })
afterEach(() => setCommerceEventWriter(null))

describe('parseHandoffBody', () => {
  it('accepts exactly {linkId, requestId, platform?} in their opaque shapes', () => {
    expect(parseHandoffBody({ linkId: LINK, requestId: REQ, platform: 'web' })).toEqual({ linkId: LINK, requestId: REQ, platform: 'web' })
    expect(parseHandoffBody({ linkId: LINK, requestId: REQ, platform: 'tv' })).toEqual({ linkId: LINK, requestId: REQ })
    expect(parseHandoffBody({ linkId: LINK, requestId: REQ, url: 'https://x' })).toEqual({ linkId: LINK, requestId: REQ })
  })
  it('refuses anything else — no URL, no free text, no wrong shape', () => {
    for (const bad of [null, 'x', {}, { linkId: 'short', requestId: REQ }, { linkId: LINK, requestId: 'nope' }, { linkId: LINK }, { url: 'https://vn.trip.com/' }]) {
      expect(parseHandoffBody(bad)).toBeNull()
    }
  })
})

describe('POST', () => {
  it('400 on a malformed body and nothing is emitted', async () => {
    const res = await post({ url: 'https://vn.trip.com/x' })
    expect(res.status).toBe(400)
    expect(written).toEqual([])
    expect((await post('not json')).status).toBe(400)
  })

  it('200 with the platform off: acknowledged, dropped', async () => {
    const res = await post({ linkId: LINK, requestId: REQ, platform: 'web' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(written).toEqual([])
  })

  it('200 with the platform on: one commerce_handoff carrying only the opaque ids', async () => {
    flags.CCP_ENABLED = true
    const res = await post({ linkId: LINK, requestId: REQ, platform: 'web' })
    expect(res.status).toBe(200)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ type: 'commerce_handoff', linkId: LINK, requestId: REQ, platform: 'web', component: 'ccp' })
    expect(JSON.stringify(written[0])).not.toMatch(/https?:\/\//)
  })

  it('rate-limits a flooding client', async () => {
    const ip = '198.51.100.9'
    let last = 200
    for (let i = 0; i < 70; i++) last = (await post({ linkId: LINK, requestId: REQ }, ip)).status
    expect(last).toBe(429)
  })
})
