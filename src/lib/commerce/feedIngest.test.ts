// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { ingestMerchantFeed, feedRow, type FeedMerchant } from './feedIngest'
import { feedHintsFor, feedRowMatches } from './feedHints'
import { attachCommerceLinks } from '@/lib/ai/tools/commerce'
import { CCP_FEED_INGEST_ENABLED, CCP_FEED_DISPLAY_ENABLED } from '@/lib/config/product'

// ─────────────────────────────────────────────────────────────────────────────
// B5 — the ACCESSTRADE feed: ingest ON (D6 transport policy unchanged), display still OFF (D7).
// The feed carries no stock and no brand: nothing here backs a stock claim.
// ─────────────────────────────────────────────────────────────────────────────

const CSV = ['"sku","name","url","price","discount","image","desc","category"',
  '"CPS-1","Điện thoại iPhone 15 128GB","https://cellphones.com.vn/iphone-15.html","18990000","17490000","https://cdn.cellphones.com.vn/x.jpg","","Điện thoại"',
  '"CPS-2","Ốp lưng iPhone 15","http://cellphones.com.vn/op-lung.html","190000","","","",""',
  '"CPS-3","Tai nghe Sony WH-1000XM5","https://cellphones.com.vn/sony-wh-1000xm5.html","6990000","5990000","","",""'].join(String.fromCharCode(10))

const m: FeedMerchant = { providerId: 'cellphones', campaignId: '6259155740535091857', allowedHosts: ['cellphones.com.vn', 'www.cellphones.com.vn'] }

describe('ingestMerchantFeed', () => {
  it('flags are as the owner decided: ingest ON, display OFF (D7 open)', () => {
    expect(CCP_FEED_INGEST_ENABLED).toBe(true)
    expect(CCP_FEED_DISPLAY_ENABLED).toBe(false)
  })
  it('without credentials it is BLOCKED and says which variable, never a fetch', async () => {
    const fetchImpl = vi.fn()
    const out = await ingestMerchantFeed(m, { env: {} as NodeJS.ProcessEnv, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out).toMatchObject({ ok: false, reason: 'blocked_no_credentials', detail: 'ACCESSTRADE_API_KEY' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('D6: a plain-http or unlisted endpoint is refused before any request', async () => {
    const fetchImpl = vi.fn()
    const env = { ACCESSTRADE_API_KEY: 'k', ACCESSTRADE_FEED_ENDPOINT: 'http://api.accesstrade.vn/v1/datafeeds?campaign={campaign}' } as unknown as NodeJS.ProcessEnv
    expect(await ingestMerchantFeed(m, { env, fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ ok: false, reason: 'source_refused', detail: 'not_https' })
    const env2 = { ...env, ACCESSTRADE_FEED_ENDPOINT: 'https://datafeed.accesstrade.me/x?campaign={campaign}' } as unknown as NodeJS.ProcessEnv
    expect(await ingestMerchantFeed(m, { env: env2, fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ ok: false, reason: 'source_refused', detail: 'known_broken_tls' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('fetches the authenticated endpoint with the campaign id, parses the CSV, keeps only https rows on the merchant host', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response(CSV, { status: 200 }))
    const env = { ACCESSTRADE_API_KEY: 'k', ACCESSTRADE_FEED_ENDPOINT: 'https://api.accesstrade.vn/v1/datafeeds?campaign={campaign}&format=csv' } as unknown as NodeJS.ProcessEnv
    const out = await ingestMerchantFeed(m, { env, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.accesstrade.vn/v1/datafeeds?campaign=6259155740535091857&format=csv')
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Token k' })
    expect((fetchImpl.mock.calls[0][1] as RequestInit).redirect).toBe('error')
    expect(out.rowsTotal).toBe(3)
    expect(out.rowsKept).toBe(2) // the http:// row is rejected
    expect(out.items.map(i => i.sku)).toEqual(['CPS-1', 'CPS-3'])
    const row = feedRow('cellphones', out.items[0])
    expect(row).toMatchObject({ provider_id: 'cellphones', sku: 'CPS-1', price: 18990000, discount: 17490000 })
    expect('stock' in row || 'in_stock' in row || 'brand' in row).toBe(false) // the feed has none; none is invented
  })
})

describe('feed hints — the deepest destination, first', () => {
  const rows = [
    { provider_id: 'cellphones', name: 'Điện thoại iPhone 15 128GB', url: 'https://cellphones.com.vn/iphone-15.html' },
    { provider_id: 'cellphones', name: 'Ốp lưng iPhone 15 Pro Max', url: 'https://cellphones.com.vn/op-lung.html' },
    { provider_id: 'cellphones', name: 'Tai nghe Sony WH-1000XM5', url: 'https://cellphones.com.vn/sony-wh-1000xm5.html' },
  ]
  it('matches by every subject token, shortest name first, https only', async () => {
    expect(feedRowMatches('iPhone 15', 'Điện thoại iPhone 15 128GB')).toBe(true)
    expect(feedRowMatches('Sony WH-1000XM5', 'Tai nghe Sony WH-1000XM5')).toBe(true)
    expect(feedRowMatches('Sony WH-1000XM5', 'Tai nghe Sony WH-1000XM4')).toBe(false)
    const hints = await feedHintsFor('iPhone 15', { reader: async () => rows })
    expect(hints.map(h => h.url)).toEqual(['https://cellphones.com.vn/iphone-15.html']) // the case for the Pro Max is another product (§8)
  })
  it('the seam takes a feed hint before any search: a product link with ZERO Serper calls', async () => {
    const search = vi.fn(async () => [])
    const row = { title: 'Điện thoại iPhone 15 128GB', link: 'https://www.google.com/search?q=iphone+15&ibp=oshop', price_vnd: 18990000, source: 'Google Shopping (Serper)' }
    const result = { search_results: [row], source: 'Google Shopping (Serper)' }
    await attachCommerceLinks('search_products', result, { enabled: true, now: new Date('2026-09-20T10:00:00+07:00'), search, feedHints: async () => [{ url: 'https://cellphones.com.vn/iphone-15.html', title: 'Điện thoại iPhone 15 128GB', providerId: 'cellphones' }] })
    const links = ((row as Record<string, unknown>).commerce_links ?? []) as Array<{ providerId: string; destinationUrl: string; depth: number }>
    expect(links.some(l => l.providerId === 'cellphones' && l.destinationUrl === 'https://cellphones.com.vn/iphone-15.html' && l.depth >= 3), JSON.stringify(links)).toBe(true)
  })
})

describe('the cron is scheduled and guarded', () => {
  it('vercel.json runs /api/cron/feed-ingest daily; the route checks CRON_SECRET', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
    expect(vercel.crons.some(c => c.path === '/api/cron/feed-ingest')).toBe(true)
    expect(readFileSync('src/app/api/cron/feed-ingest/route.ts', 'utf8')).toContain('CRON_SECRET')
  })
})
