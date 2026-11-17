import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ deny: false, calls: [] as unknown[][] }))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: vi.fn(async () => ({ ok: !h.deny, retryAfter: 9, scope: 'instance', ...(h.deny ? { reason: 'limit_exceeded' } : {}) })),
}))
vi.mock('@/lib/entity/wikiFacts', () => ({
  lookupWikiFacts: vi.fn(async (...a: unknown[]) => { h.calls.push(a); return a[0] === 'Elon Musk' ? { facts: [{ label: 'Sinh', value: '1971' }], wikidata: 'https://www.wikidata.org/wiki/Q317521' } : null }),
}))

import { GET } from './route'
const call = (qs: string) => GET(new NextRequest(`http://localhost/api/entity-facts${qs}`, { headers: { 'x-vercel-forwarded-for': '203.0.113.7' } }))
beforeEach(() => { h.deny = false; h.calls = [] })

describe('GET /api/entity-facts', () => {
  it('the facts of a valid title, for the wiki and the language asked; a host, URL or property parameter changes nothing', async () => {
    const res = await call('?t=Elon%20Musk&w=en&ui=vi&host=evil.test&url=http://169.254.169.254/&p=P569')
    const j = await res.json()
    expect(j).toEqual({ facts: [{ label: 'Sinh', value: '1971' }], wikidata: 'https://www.wikidata.org/wiki/Q317521' })
    expect(h.calls[0].slice(0, 3)).toEqual(['Elon Musk', 'en', 'vi'])
  })
  it('an invalid title or a subject Wikidata does not know is a 200 with no facts; an unknown language falls back to Vietnamese', async () => {
    expect(await (await call('?t=..%2F..%2Fetc')).json()).toEqual({ facts: [] })
    expect(await (await call('')).json()).toEqual({ facts: [] })
    expect(await (await call('?t=Không%20Có')).json()).toEqual({ facts: [] })
    await call('?t=Elon%20Musk&w=xx&ui=zz')
    expect(h.calls.at(-1)!.slice(1, 3)).toEqual(['vi', 'vi'])
  })
  it('a visitor over the limit gets the shared answer', async () => {
    h.deny = true
    expect((await call('?t=Elon%20Musk')).status).toBe(429)
    expect(h.calls).toHaveLength(0)
  })
})
