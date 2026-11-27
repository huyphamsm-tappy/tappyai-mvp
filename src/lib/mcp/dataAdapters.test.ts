import { describe, it, expect, vi, beforeEach } from 'vitest'

// The real adapters behind search_deals and search_clips. Database reads of PUBLIC data only: the Deal page's active deals (getActiveDeals) and the
// public Explore feed's rules (not hidden, published, a video). An ANON client with no cookies: row-level security applies, nothing is read with a service key.

const h = vi.hoisted(() => ({
  getActiveDeals: vi.fn(),
  cards: vi.fn(() => [] as Array<Record<string, unknown>>),
  refresh: vi.fn(async () => undefined),
  calls: [] as Array<[string, ...unknown[]]>,
  result: { data: [] as unknown[], error: null as unknown },
  created: [] as Array<{ url: string; key: string; opts: unknown }>,
}))
vi.mock('@/lib/deals/partnerDeals', () => ({ getActiveDeals: h.getActiveDeals }))
// the tracked partner cards the Deal page shows (Lazada, Vexere, ...): the same resolver, the same provider config refresh
vi.mock('@/lib/deals/affiliatePartners', () => ({ affiliatePartnerCards: h.cards }))
vi.mock('@/lib/ccp', () => ({ hasProviderConfigSource: () => true, refreshProviderConfig: h.refresh }))
vi.mock('@/lib/commerce/providerConfigSource', () => ({ installProviderConfigSource: () => undefined }))
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

beforeEach(() => { h.getActiveDeals.mockReset(); h.cards.mockReset(); h.cards.mockReturnValue([]); h.refresh.mockClear(); h.calls.length = 0; h.created.length = 0; h.result = { data: [], error: null } })

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

describe('dealsAdapter: the tracked partner cards (Lazada, Vexere, ...) are part of the answer', () => {
  const CARDS = [
    { providerId: 'vexere', partnerName: 'Vexere', descriptionKey: 'deals.partner.vexere', url: 'https://go.isclix.com/deep_link/1/2?url=https%3A%2F%2Fvexere.com' },
    { providerId: 'agoda', partnerName: 'Agoda', descriptionKey: 'deals.partner.agoda', url: 'https://www.agoda.com/?cid=1' },
    { providerId: 'lazada', partnerName: 'Lazada', descriptionKey: 'deals.partner.lazada', url: 'https://go.isclix.com/deep_link/1/3?url=https%3A%2F%2Fwww.lazada.vn' },
  ]
  const rows = async (q: string, lang: 'vi' | 'en' = 'vi', limit = 10) => (await dealsAdapter({ query: q, lang, limit })).rows as Array<Record<string, unknown>>
  const names = async (q: string, lang: 'vi' | 'en' = 'vi', limit = 10) => (await rows(q, lang, limit)).map(r => r.partnerName)

  it('🚨 Lazada and Vexere appear even when the offers table has nothing about them, FIRST (the Deal page puts them first), then the managed deals', async () => {
    h.getActiveDeals.mockResolvedValue([deal({ id: 'a', partnerName: 'Shopee', title: 'Freeship' })])
    h.cards.mockReturnValue(CARDS)
    expect(await names('ưu đãi')).toEqual(['Vexere', 'Agoda', 'Lazada', 'Shopee'])
  })
  it('the same provider-config refresh the Deal page uses runs first; the cards come out in the caller\'s language and carry the tracked link', async () => {
    h.getActiveDeals.mockResolvedValue([])
    h.cards.mockReturnValue(CARDS)
    const r = (await rows('lazada', 'en'))[0]
    expect(h.refresh).toHaveBeenCalled()
    expect(h.cards.mock.calls[0]).toEqual([{ locale: 'en' }])
    expect(r).toMatchObject({ partnerName: 'Lazada', title: 'Lazada: Shop on Lazada.', description: 'Shop on Lazada.', officialUrl: CARDS[2].url })
    expect(String(r.id)).toBe('partner:lazada')
  })
  it('a card makes no claim of a price, a discount or a voucher (the Deal page\'s own rule)', async () => {
    h.getActiveDeals.mockResolvedValue([])
    h.cards.mockReturnValue(CARDS)
    for (const r of await rows('ưu đãi')) { expect(r.discountLabel ?? null).toBeNull(); expect(r.voucherCode ?? null).toBeNull(); expect(r.endAt ?? null).toBeNull() }
  })
  it('a question narrows the cards like the deals: "lazada" → Lazada; "xe khách" → Vexere; "khách sạn" → Agoda', async () => {
    h.getActiveDeals.mockResolvedValue([])
    h.cards.mockReturnValue(CARDS)
    expect(await names('lazada')).toEqual(['Lazada'])
    expect(await names('xe khách')).toEqual(['Vexere'])
    expect(await names('khách sạn')).toEqual(['Agoda'])
  })
  it('a partner that already has a managed deal is not listed twice', async () => {
    h.getActiveDeals.mockResolvedValue([deal({ id: 'z', partnerName: 'Lazada', title: 'Giảm 50% đơn đầu', discountLabel: '50%' })])
    h.cards.mockReturnValue(CARDS)
    const lazada = (await rows('lazada')).filter(r => r.partnerName === 'Lazada')
    expect(lazada).toHaveLength(1)
    expect(lazada[0].discountLabel).toBe('50%')
  })
  it('a card source that fails (config table down, resolver error) never takes the managed deals with it', async () => {
    h.getActiveDeals.mockResolvedValue([deal({ id: 'a', partnerName: 'Shopee', title: 'Freeship' })])
    h.refresh.mockRejectedValueOnce(new Error('db'))
    h.cards.mockReturnValue(CARDS)
    expect(await names('ưu đãi')).toEqual(['Shopee'])
    h.refresh.mockResolvedValue(undefined)
    h.cards.mockImplementation(() => { throw new Error('resolver') })
    expect(await names('ưu đãi')).toEqual(['Shopee'])
  })
  it('a deal that states a discount or a voucher leads; then the cards; then the deals that only name the partner', async () => {
    h.getActiveDeals.mockResolvedValue([
      deal({ id: 'a', partnerName: 'Shopee', title: 'Freeship' }),
      deal({ id: 'g', partnerName: 'Grab', title: 'Giảm 30K', voucherCode: 'GRAB30' }),
      deal({ id: 'k', partnerName: 'Klook', title: 'Giảm 10%', discountLabel: '10%' }),
    ])
    h.cards.mockReturnValue(CARDS)
    expect(await names('ưu đãi')).toEqual(['Grab', 'Klook', 'Vexere', 'Agoda', 'Lazada', 'Shopee'])
  })
  it('the limit counts the cards too', async () => {
    h.getActiveDeals.mockResolvedValue([deal({ id: 'a', partnerName: 'Shopee' })])
    h.cards.mockReturnValue(CARDS)
    expect(await names('ưu đãi', 'vi', 2)).toEqual(['Vexere', 'Agoda'])
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
