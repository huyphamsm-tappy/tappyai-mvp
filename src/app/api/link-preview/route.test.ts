import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ deny: false, keys: [] as string[] }))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: vi.fn(async (key: string) => { h.keys.push(key); return { ok: !h.deny, retryAfter: 9, scope: 'instance', ...(h.deny ? { reason: 'limit_exceeded' } : {}) } }),
}))

import { GET } from './route'

const MAX_EXCERPT = 700 // the route's limit (a route file cannot export it)
import { __setPageFetchOverride, type PageFetchResult } from '@/lib/security/safePageFetch'

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/link-preview${qs}`, { headers: { 'x-vercel-forwarded-for': '203.0.113.7', cookie: 'sb=secret' } }))
const html = (title: string, body: string) => `<!doctype html><html lang="vi"><head><title>${title}</title><meta property="og:site_name" content="Báo Mẫu"><meta name="description" content="Mô tả ngắn của bài viết."><meta property="article:published_time" content="2026-11-13T08:00:00Z"></head><body><article><h1>${title}</h1>${body}</article></body></html>`
const para = (n: number) => `<p>${'Đây là một đoạn văn bản dài của bài viết để thử việc cắt gọn. '.repeat(n)}</p>`
const ok = (body: string, finalUrl = 'https://baomau.vn/bai-viet'): PageFetchResult => ({ ok: true, url: finalUrl, finalUrl, status: 200, contentType: 'text/html; charset=utf-8', body, bytes: body.length, truncated: false, redirects: 0, ms: 5 })

let seen: Array<{ url: string; opts: Record<string, unknown> }> = []
beforeEach(() => { h.deny = false; h.keys = []; seen = [] })
afterEach(() => __setPageFetchOverride(null))

describe('GET /api/link-preview', () => {
  it('a page: its title, site, date, description and the first passages - never more than the excerpt limit', async () => {
    __setPageFetchOverride(async (url, opts) => { seen.push({ url, opts: opts as Record<string, unknown> }); return ok(html('Giá vàng giảm mạnh', `${para(4)}${para(4)}${para(4)}${para(4)}`)) })
    const res = await call('?u=' + encodeURIComponent('https://baomau.vn/bai-viet'))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j).toMatchObject({ ok: true, host: 'baomau.vn', title: 'Giá vàng giảm mạnh', siteName: 'Báo Mẫu', description: 'Mô tả ngắn của bài viết.' })
    expect(String(j.publishedAt)).toContain('2026-11-13')
    expect(j.passages.length).toBeGreaterThan(0)
    expect(j.passages.join('').length).toBeLessThanOrEqual(MAX_EXCERPT + 5)
    expect(Object.keys(j).sort()).toEqual(['description', 'host', 'ok', 'passages', 'publishedAt', 'siteName', 'title', 'url'])
  })
  it('only https; credentials, other schemes and a missing address are refused before any fetch (an internal address is refused by the fetch itself, tested with it)', async () => {
    __setPageFetchOverride(async url => { seen.push({ url, opts: {} }); return ok('x') })
    for (const u of ['http://baomau.vn/a', 'https://user:pw@baomau.vn/a', 'javascript:alert(1)', 'file:///etc/passwd', '', 'ftp://x.org/a']) {
      const res = await call('?u=' + encodeURIComponent(u))
      expect(res.status, u).toBe(400)
    }
    expect(seen).toHaveLength(0)
  })
  it('the fetch is the research reader\'s public-page fetch with https-only, bounded size and time; nothing of the visitor is passed on', async () => {
    __setPageFetchOverride(async (url, opts) => { seen.push({ url, opts: opts as Record<string, unknown> }); return ok(html('T', para(2))) })
    await call('?u=' + encodeURIComponent('https://baomau.vn/bai-viet'))
    expect(seen).toHaveLength(1)
    expect(seen[0].opts).toMatchObject({ allowHttp: false, maxBytes: 400_000, totalTimeoutMs: 6_000 })
    expect(JSON.stringify(seen[0])).not.toContain('secret')
  })
  it('a page that cannot be read is a 200 with ok:false and the host, so the reader can still offer the original page', async () => {
    __setPageFetchOverride(async () => ({ ok: false, url: 'https://baomau.vn/x', reason: 'blocked_address', redirects: 1, ms: 3 }))
    const res = await call('?u=' + encodeURIComponent('https://baomau.vn/x'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, host: 'baomau.vn', reason: 'blocked_address' })
  })
  it('a visitor over the limit gets the shared rate-limit answer; the key is the visitor\'s own', async () => {
    h.deny = true
    __setPageFetchOverride(async url => { seen.push({ url, opts: {} }); return ok('x') })
    const res = await call('?u=' + encodeURIComponent('https://baomau.vn/a'))
    expect(res.status).toBe(429)
    expect(h.keys[0]).toMatch(/^link-preview:/)
    expect(seen).toHaveLength(0)
  })
})
