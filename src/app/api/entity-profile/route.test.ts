import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ deny: false, urls: [] as string[], keys: [] as string[] }))

vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: vi.fn(async (key: string) => { h.keys.push(key); return { ok: !h.deny, retryAfter: 9, scope: 'instance', ...(h.deny ? { reason: 'limit_exceeded' } : {}) } }),
}))
vi.mock('@/lib/security/safeFetch', () => ({
  safeGetText: vi.fn(async (url: string) => {
    h.urls.push(url)
    const title = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').replace(/_/g, ' ')
    if (title !== 'Elon Musk') throw new Error('404')
    return {
      finalUrl: url,
      text: JSON.stringify({ type: 'standard', title: 'Elon Musk', description: 'Doanh nhân', extract: 'Elon Musk là doanh nhân.', content_urls: { desktop: { page: 'https://vi.wikipedia.org/wiki/Elon_Musk' } }, thumbnail: { source: 'https://upload.wikimedia.org/a.jpg' } }),
    }
  }),
}))

import { GET } from './route'
import { __clearWikiProfileCache } from '@/lib/entity/wikiProfile'

const call = (qs: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(`http://localhost/api/entity-profile${qs}`, { headers: { 'x-vercel-forwarded-for': '203.0.113.7', ...headers } }))

beforeEach(() => { h.deny = false; h.urls = []; h.keys = []; __clearWikiProfileCache() })

describe('GET /api/entity-profile', () => {
  it('returns the resolved profiles only; an unresolved name is simply absent', async () => {
    const res = await call('?t=Elon%20Musk&t=Kh%C3%B4ng%20C%C3%B3')
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.profiles).toHaveLength(1)
    expect(j.profiles[0]).toMatchObject({ name: 'Elon Musk', title: 'Elon Musk', source: 'Wikipedia', href: 'https://vi.wikipedia.org/wiki/Elon_Musk' })
    expect(Object.keys(j)).toEqual(['profiles'])
  })

  it('SSRF: a host, URL or language parameter changes nothing; every outbound URL is on a fixed wiki host', async () => {
    await call('?t=Elon%20Musk&host=evil.test&url=http://169.254.169.254/&lang=xx&t=http%3A%2F%2F169.254.169.254%2Flatest&t=%2F%2Fevil.test%2Fx')
    expect(h.urls.length).toBeGreaterThan(0)
    for (const u of h.urls) expect(new URL(u).hostname).toMatch(/^(vi|en)\.wikipedia\.org$/)
  })

  it('path traversal / escapes in a title never reach the fetcher', async () => {
    const res = await call(`?t=${encodeURIComponent('../../etc/passwd')}&t=${encodeURIComponent('%2e%2e%2f')}&t=${encodeURIComponent('File:X.jpg')}&t=a%00b`)
    expect(res.status).toBe(200)
    expect((await res.json()).profiles).toEqual([])
    expect(h.urls).toEqual([])
  })

  it('looks up at most 6 distinct names, once each', async () => {
    const qs = '?' + ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'a'].map(n => `t=Tên${n}`).join('&')
    await call(qs)
    const titles = new Set(h.urls.map(u => decodeURIComponent(new URL(u).pathname.split('/').pop() ?? '')))
    expect(titles.size).toBeLessThanOrEqual(6)
  })

  it('is rate limited per caller and answers 429 without calling Wikipedia', async () => {
    h.deny = true
    const res = await call('?t=Elon%20Musk')
    expect(res.status).toBe(429)
    expect(h.urls).toEqual([])
    expect(h.keys[0]).toMatch(/^entity-profile:/)
  })

  it('does not forward the visitor\'s cookies or authorization anywhere (the fetcher gets a URL and nothing else)', async () => {
    const { safeGetText } = await import('@/lib/security/safeFetch')
    await call('?t=Elon%20Musk', { cookie: 'sb-token=SECRET', authorization: 'Bearer SECRET' })
    for (const c of vi.mocked(safeGetText).mock.calls) expect(JSON.stringify(c)).not.toContain('SECRET')
  })

  it('with no names answers an empty list', async () => {
    expect((await (await call('')).json()).profiles).toEqual([])
  })
})
