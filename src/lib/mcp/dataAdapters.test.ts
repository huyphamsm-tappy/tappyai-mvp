import { describe, it, expect, vi, beforeEach } from 'vitest'

// The real adapters behind search_deals and search_clips. Database reads of PUBLIC data only: the Deal page's active deals (getActiveDeals) and the
// public Explore feed's rules (not hidden, published, a video). An ANON client with no cookies: row-level security applies, nothing is read with a service key.

const h = vi.hoisted(() => ({
  getActiveDeals: vi.fn(),
  calls: [] as Array<[string, ...unknown[]]>,
  result: { data: [] as unknown[], error: null as unknown },
  created: [] as Array<{ url: string; key: string; opts: unknown }>,
}))
vi.mock('@/lib/deals/partnerDeals', () => ({ getActiveDeals: h.getActiveDeals }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, opts: unknown) => {
    h.created.push({ url, key, opts })
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'or', 'eq', 'not', 'order', 'limit']) q[m] = (...a: unknown[]) => { h.calls.push([m, ...a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => resolve(h.result)
    return { from: (t: string) => { h.calls.push(['from', t]); return q } }
  },
}))

import { dealsAdapter, clipsAdapterFromEnv } from './dataAdapters'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'

const deal = (over: Record<string, unknown> = {}) => ({ id: 'd', partnerSlug: 'p', partnerName: 'Shopee', partnerType: 'ecommerce', category: 'Mua sắm', categoryKey: 'Mua sắm', title: 'Ưu đãi', description: null, officialUrl: 'https://x.example', bannerImage: null, logoImage: null, isFeatured: false, discountLabel: null, voucherCode: null, endAt: null, ...over })
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://p.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' }
const callsOf = (m: string) => h.calls.filter(c => c[0] === m)

beforeEach(() => { h.getActiveDeals.mockReset(); h.calls.length = 0; h.created.length = 0; h.result = { data: [], error: null } })

describe('dealsAdapter', () => {
  const list = [
    deal({ id: 'a', partnerName: 'Shopee', title: 'Freeship Shopee', category: 'Mua sắm' }),
    deal({ id: 'b', partnerName: 'Lazada', title: 'Giảm 50% đơn đầu', category: 'Mua sắm', isFeatured: true }),
    deal({ id: 'c', partnerName: 'Grab', title: 'Giảm 30K chuyến xe', category: 'Di chuyển', endAt: '2026-12-01T00:00:00Z' }),
    deal({ id: 'd', partnerName: 'Agoda', title: 'Khách sạn giảm 20%', category: 'Du lịch', endAt: '2026-11-30T00:00:00Z' }),
  ]
  const ids = async (q: string, limit = 10, lang: 'vi' | 'en' = 'vi') => (await dealsAdapter({ query: q, lang, limit })).rows.map(r => (r as { id: string }).id)

  it('asks the Deal page\'s own reader for the Vietnamese market in the caller\'s language', async () => {
    h.getActiveDeals.mockResolvedValue(list)
    await ids('lazada', 10, 'en')
    expect(h.getActiveDeals).toHaveBeenCalledWith('VN', 'en')
  })
  it('finds a deal by partner name, accent-insensitively', async () => {
    h.getActiveDeals.mockResolvedValue(list)
    expect(await ids('LAZADA')).toEqual(['b'])
    expect(await ids('mua sam')).toEqual(['b', 'a'])
    expect(await ids('di chuyen')).toEqual(['c'])
  })
  it('a generic ask ("ưu đãi", "deal", "voucher giảm giá") lists everything, featured first, then the ones ending soonest', async () => {
    h.getActiveDeals.mockResolvedValue(list)
    expect(await ids('ưu đãi giảm giá')).toEqual(['b', 'd', 'c', 'a'])
    expect(await ids('deals')).toEqual(['b', 'd', 'c', 'a'])
  })
  it('nothing matches → no rows (nothing is invented); the limit is applied; a read failure yields an empty list, not a throw', async () => {
    h.getActiveDeals.mockResolvedValue(list)
    expect(await ids('zzzz')).toEqual([])
    expect(await ids('ưu đãi', 2)).toHaveLength(2)
    h.getActiveDeals.mockRejectedValue(new Error('db'))
    expect(await ids('lazada')).toEqual([])
  })
})

describe('clipsAdapterFromEnv', () => {
  it('is unwired without the public database settings (the gateway then answers PROVIDER_UNAVAILABLE)', () => {
    expect(clipsAdapterFromEnv({})).toBeNull()
    expect(clipsAdapterFromEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://p.supabase.co' })).toBeNull()
  })

  it('🚨 reads only public rows with an ANON, cookie-less client: not hidden, published, a video; no author column is selected', async () => {
    h.result = { data: [{ id: '7ca8479a-1cb8-492c-9836-de22cb78d366', place_name: 'Phở' }], error: null }
    const a = clipsAdapterFromEnv(ENV)!
    const out = await a({ query: 'phở', lang: 'vi', limit: 5 })
    expect(out.rows).toHaveLength(1)
    expect(h.created[0]).toMatchObject({ url: ENV.NEXT_PUBLIC_SUPABASE_URL, key: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY })
    expect(JSON.stringify(h.created[0].opts)).toMatch(/persistSession.*false|false.*persistSession/)
    expect(callsOf('from')[0][1]).toBe('reviews')
    const select = String(callsOf('select')[0][1])
    expect(select).not.toMatch(/user_id|profiles|source_url|media_url|photos|hashtags/)
    const ors = callsOf('or').map(c => String(c[1]))
    expect(ors).toContain('is_hidden.is.null,is_hidden.eq.false')
    expect(ors).toContain(publishableFilter())
    expect(callsOf('eq')).toContainEqual(['eq', 'content_type', 'video'])
    expect(callsOf('not')).toContainEqual(['not', 'media_url', 'is', null])
    expect(callsOf('limit')[0][1]).toBe(5)
  })

  it('every word of the query must match the place, caption or address (one OR group per word); quotes and backslashes cannot break out of the filter', async () => {
    const a = clipsAdapterFromEnv(ENV)!
    await a({ query: 'phở hà nội', lang: 'vi', limit: 5 })
    const search = callsOf('or').map(c => String(c[1])).filter(s => s.includes('ilike'))
    expect(search).toHaveLength(3)
    for (const s of search) expect(s).toMatch(/^place_name\.ilike\."%.+%",body\.ilike\."%.+%",place_address\.ilike\."%.+%"$/)
    h.calls.length = 0
    await a({ query: 'a" ,id.eq.1) \\ x', lang: 'vi', limit: 5 })
    for (const s of callsOf('or').map(c => String(c[1])).filter(x => x.includes('ilike'))) expect(s).not.toMatch(/[^\\]"[^%,]|\)\s*$/)
  })

  it('most liked first, then newest; a database error is thrown for the gateway to report without detail', async () => {
    const a = clipsAdapterFromEnv(ENV)!
    await a({ query: 'phở', lang: 'vi', limit: 3 })
    expect(callsOf('order').map(c => c[1])).toEqual(['like_count', 'created_at'])
    h.result = { data: null as never, error: { message: 'boom' } }
    await expect(a({ query: 'phở', lang: 'vi', limit: 3 })).rejects.toThrow()
  })
})
