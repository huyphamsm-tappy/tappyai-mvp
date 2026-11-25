import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ deny: false, keys: [] as string[] }))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: vi.fn(async (key: string) => { h.keys.push(key); return { ok: !h.deny, retryAfter: 9, scope: 'instance', ...(h.deny ? { reason: 'limit_exceeded' } : {}) } }),
}))

import { GET } from './route'
import { __setPageFetchOverride, type PageFetchResult } from '@/lib/security/safePageFetch'

// Plan PDF pictures (20/11): the browser cannot read most photo hosts (no CORS), so the PDF asks this route for the picture's bytes. https only, the same public-page fetch as the
// reader (private addresses refused at every hop), pictures only, size capped, a rate limit per visitor, no cookie forwarded, nothing but the picture goes back.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const call = (qs: string) => GET(new NextRequest(`http://localhost/api/pdf-image${qs}`, { headers: { 'x-vercel-forwarded-for': '203.0.113.7', cookie: 'sb=secret' } }))
const img = (contentType = 'image/png', raw: Uint8Array = PNG): PageFetchResult => ({ ok: true, url: 'https://cdn.example/a.png', finalUrl: 'https://cdn.example/a.png', status: 200, contentType, body: '', bytes: raw.length, truncated: false, redirects: 0, ms: 5, raw })

let seen: Array<{ url: string; opts: Record<string, unknown> }> = []
beforeEach(() => { h.deny = false; h.keys = []; seen = [] })
afterEach(() => __setPageFetchOverride(null))

describe('GET /api/pdf-image', () => {
  it('sends the picture bytes with their type, asks the fetch for a capped picture only, and forwards no cookie', async () => {
    __setPageFetchOverride(async (url, opts) => { seen.push({ url, opts: opts as Record<string, unknown> }); return img() })
    const res = await call('?u=' + encodeURIComponent('https://cdn.example/a.png'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
    expect(seen).toHaveLength(1)
    expect(typeof seen[0].opts.imageMaxBytes).toBe('number')
    expect(seen[0].opts.allowHttp).toBe(false)
    expect(JSON.stringify(seen[0].opts)).not.toContain('secret')
  })
  it('refuses a missing, non-https, credentialed or over-long address before any fetch', async () => {
    __setPageFetchOverride(async (url, opts) => { seen.push({ url, opts: opts as Record<string, unknown> }); return img() })
    for (const u of ['', 'http://cdn.example/a.png', 'https://user:pw@cdn.example/a.png', 'ftp://cdn.example/a.png', 'https://cdn.example/' + 'a'.repeat(1600)]) {
      expect((await call('?u=' + encodeURIComponent(u))).status).toBe(400)
    }
    expect(seen).toHaveLength(0)
  })
  it('a failed fetch, a page that is not a picture, and a picture type the route does not serve are all a plain 404', async () => {
    __setPageFetchOverride(async () => ({ ok: false, url: 'https://cdn.example/a.png', reason: 'blocked_address', redirects: 0, ms: 1 }))
    expect((await call('?u=' + encodeURIComponent('https://cdn.example/a.png'))).status).toBe(404)
    __setPageFetchOverride(async () => img('text/html'))
    expect((await call('?u=' + encodeURIComponent('https://cdn.example/a.png'))).status).toBe(404)
    __setPageFetchOverride(async () => img('image/svg+xml'))
    expect((await call('?u=' + encodeURIComponent('https://cdn.example/a.svg'))).status).toBe(404)
    __setPageFetchOverride(async () => ({ ...img(), raw: undefined }))
    expect((await call('?u=' + encodeURIComponent('https://cdn.example/a.png'))).status).toBe(404)
  })
  it('is rate limited per visitor, before any fetch', async () => {
    h.deny = true
    __setPageFetchOverride(async (url, opts) => { seen.push({ url, opts: opts as Record<string, unknown> }); return img() })
    const res = await call('?u=' + encodeURIComponent('https://cdn.example/a.png'))
    expect(res.status).toBe(429)
    expect(seen).toHaveLength(0)
    expect(h.keys[0]).toMatch(/^pdf-image:/)
  })
})
