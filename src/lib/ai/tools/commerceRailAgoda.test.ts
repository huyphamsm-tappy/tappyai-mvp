import { describe, it, expect, vi, afterEach } from 'vitest'
import { attachCommerceLinks, type RouteHandoffFacts } from './commerce'
import { GRAMMARS } from '@/lib/ccp/adapters/grammar'
import { getProvider, resolveCommerce, type CommerceRequest } from '@/lib/ccp'
import { wrapWithParam } from '@/lib/ccp/tracking/param'
import { effectiveTracking, setProviderConfigSource, type ProviderOverride } from '@/lib/ccp/registry/runtime'
import { rankLinks } from '@/lib/ccp/ranking/score'

// ─────────────────────────────────────────────────────────────────────────────
// 29 Oct 2026 (owner: "deeplink as deep as possible, affiliate when we can"):
// Vexere TRAINS as a dated train list, Agoda property pages with the stay applied
// and the partner cid, and monetisation demoted to a pure tie-breaker. Every
// merchant page is a fixture; the URLs were opened live on 29 Oct 2026.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-29T03:00:00Z')
type Row = Record<string, unknown>
const CITY_PAGE = 'https://vexere.com/vn/ve-tau-hoa/tu-ho-chi-minh-di-nha-trang-khanh-hoa.29.417.vi'
const STATION_PAGE = 'https://vexere.com/vn/ve-tau-hoa/tu-ga-ho-chi-minh-quan-3-ho-chi-minh-di-ga-nha-trang-nha-trang-khanh-hoa.171723.171699.vi'
const train = (o: string, d: string, passengers?: number) => ({ kind: 'transport' as const, originRef: o, destinationRef: d, departDate: '2026-11-16', mode: 'train' as const, ...(passengers ? { passengers } : {}) })
const trainReq = (o: string, d: string, passengers?: number): CommerceRequest => ({ domain: 'travel', intentType: 'book_transport', subject: `${o} → ${d}`, configuration: train(o, d, passengers) })

afterEach(() => { setProviderConfigSource(null) })

describe('Vexere trains — the rail route page composes the dated train list', () => {
  it('a city page and a station page both give dat-ve-tau.vi with the ids, the day and the adults (brackets percent-encoded)', () => {
    for (const [page, from, to] of [[CITY_PAGE, '29', '417'], [STATION_PAGE, '171723', '171699']] as const) {
      const r = resolveCommerce(trainReq('sai-gon', 'nha-trang', 3), { hints: [{ url: page }], now: NOW, enabled: true })
      const l = 'links' in r ? r.links : []
      expect(l.map(x => x.directUrl)).toEqual([`https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?from=${from}_area&to=${to}_area&date%5Bdepart%5D=2026-11-16&passenger%5Badt%5D=3`])
      expect(l[0].depth).toBe(2)
      expect(l[0].paramsPreserved).toEqual(['originRef', 'destinationRef', 'departDate', 'passengers'])
    }
  })

  it('identity: a rail page for other places is refused; a coach request never takes a rail page, a train request never a coach page', () => {
    const other = resolveCommerce(trainReq('ha-noi', 'da-nang'), { hints: [{ url: CITY_PAGE }], now: NOW, enabled: true })
    expect('links' in other && other.links.filter(l => l.depth >= 2)).toEqual([])
    const coach: CommerceRequest = { ...trainReq('sai-gon', 'nha-trang'), configuration: { ...train('sai-gon', 'nha-trang'), mode: 'bus' } }
    const c = resolveCommerce(coach, { hints: [{ url: CITY_PAGE }], now: NOW, enabled: true })
    expect('links' in c && c.links.filter(l => l.depth >= 2)).toEqual([])
    const t = resolveCommerce(trainReq('sai-gon', 'da-lat'), { hints: [{ url: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html' }], now: NOW, enabled: true })
    expect('links' in t && t.links.filter(l => l.depth >= 2)).toEqual([])
  })

  it('the coach turn carries train_booking_link from the train rows it already fetched — no extra search', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:vexere.com/vi-VN') ? [{ title: 'Vé xe', link: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-nha-trang-khanh-hoa-129t23591.html', snippet: '' }] : [])
    const result: Row = { type: 'intercity', train_search_results: [{ title: 'Vé tàu Hồ Chí Minh Nha Trang', link: CITY_PAGE, snippet: '' }] }
    await attachCommerceLinks('get_transport_options', result, { enabled: true, now: NOW, search, origin: 'Sài Gòn', destination: 'Nha Trang', departDate: '2026-11-16', passengers: 2, transportMode: 'intercity' })
    expect(result.train_booking_link).toBe('https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?from=29_area&to=417_area&date%5Bdepart%5D=2026-11-16&passenger%5Badt%5D=2')
    expect(result.vexere_link).toBe('https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-nha-trang-khanh-hoa-129t23591.html?date=16-11-2026')
    expect(search.mock.calls.map(c => c[0])).toEqual(['xe khách Sài Gòn Nha Trang site:vexere.com/vi-VN'])
    expect((result._tappy_commerce as RouteHandoffFacts[]).map(f => f.providerId)).toEqual(['vexere', 'vexere'])
    // The route page behind the link (CCP's canonical, untracked): the transport tool reads its trains from it.
    expect(result._tappy_rail_page).toBe(CITY_PAGE)
  })

  it('fetched train rows that hold only a COACH page of the provider do not stop the rail search', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:vexere.com/vn/ve-tau-hoa') ? [{ title: 'Vé tàu', link: STATION_PAGE, snippet: '' }] : [])
    const result: Row = { type: 'intercity', train_search_results: [{ title: 'Vé xe', link: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-nha-trang-khanh-hoa-129t23591.html', snippet: '' }] }
    await attachCommerceLinks('get_transport_options', result, { enabled: true, now: NOW, search, origin: 'Sài Gòn', destination: 'Nha Trang', departDate: '2026-11-16', transportMode: 'intercity' })
    expect(result.train_booking_link).toContain('from=171723_area&to=171699_area')
    expect(result._tappy_rail_page).toBe(STATION_PAGE)
  })

  it('without a rail page among the fetched rows, ONE scoped search on the registry railSite; nothing found → no field', async () => {
    const search = vi.fn(async (q: string) => q.includes('site:vexere.com/vn/ve-tau-hoa') ? [{ title: 'Vé tàu', link: STATION_PAGE, snippet: '' }] : [])
    const result: Row = { type: 'intercity', train_search_results: [{ title: 'dsvn', link: 'https://dsvn.vn/', snippet: '' }] }
    await attachCommerceLinks('get_transport_options', result, { enabled: true, now: NOW, search, origin: 'Sài Gòn', destination: 'Nha Trang', departDate: '2026-11-16', transportMode: 'intercity' })
    expect(search.mock.calls.map(c => c[0])).toContain('tàu Sài Gòn Nha Trang site:vexere.com/vn/ve-tau-hoa')
    expect(result.train_booking_link).toBe('https://vexere.com/vn/ve-tau-hoa/dat-ve-tau.vi?from=171723_area&to=171699_area&date%5Bdepart%5D=2026-11-16&passenger%5Badt%5D=1')

    const none: Row = { type: 'intercity' }
    await attachCommerceLinks('get_transport_options', none, { enabled: true, now: NOW, search: vi.fn(async () => []), origin: 'Sài Gòn', destination: 'Nha Trang', departDate: '2026-11-16', transportMode: 'intercity' })
    expect(none.train_booking_link).toBeUndefined()
  })
})

describe('Agoda — the property page with the stay, and the partner cid', () => {
  const stay = { kind: 'hotel' as const, propertyRef: 'x', checkIn: '2026-11-15', checkOut: '2026-11-17', adults: 2 }
  const canonical = 'https://www.agoda.com/vi-vn/ana-mandara-villas-dalat-resort-spa/hotel/dalat-vn.html'

  it('checkIn + los + adults + rooms at L4 (children sent only when asked, then page-only)', () => {
    const c = GRAMMARS.agoda.configure!(canonical, stay)!
    expect(c.url).toBe(`${canonical}?checkIn=2026-11-15&los=2&adults=2&rooms=1`)
    expect(c.depth).toBe(4)
    expect(c.grammar).toBe('verified')
    const kids = GRAMMARS.agoda.configure!(canonical, { ...stay, children: 1 })!
    expect(kids.url).toBe(`${canonical}?checkIn=2026-11-15&los=2&adults=2&rooms=1&children=1`)
    expect(kids.pageOnly).toEqual(['children'])
    expect(GRAMMARS.agoda.configure!(canonical, { ...stay, checkOut: '2026-11-15' })).toBeNull()
  })

  it('wrapWithParam adds cid and nothing else; refuses an existing cid and a pending programme', () => {
    const t = getProvider('agoda')!.tracking!
    const w = wrapWithParam({ directUrl: `${canonical}?checkIn=2026-11-15&los=2`, tracking: t })
    expect(w.ok && w.url).toBe(`${canonical}?checkIn=2026-11-15&los=2&cid=1974819`)
    expect(w.ok && w.tracking).toEqual({ mode: 'affiliate', network: 'param:www.agoda.com', campaignId: '1974819', subIds: {}, utm: {} })
    expect(wrapWithParam({ directUrl: `${canonical}?cid=1`, tracking: t }).ok).toBe(false)
    expect(wrapWithParam({ directUrl: canonical, tracking: { ...t, approval: 'pending' } }).ok).toBe(false)
  })

  it('the owner\'s table decides: a row with the deeplink off keeps the link direct; turned on (no network) it takes the code cid', () => {
    const row = (deeplinkEnabled: boolean): ProviderOverride => ({ providerId: 'agoda', active: true, deeplinkEnabled, tier: deeplinkEnabled ? 1 : 2, network: null, campaignId: null, wrapperTemplate: null, updatedAt: null })
    const entry = getProvider('agoda')!
    setProviderConfigSource({ load: async () => [row(false)] })
    return import('@/lib/ccp/registry/runtime').then(async m => {
      await m.refreshProviderConfig({ force: true })
      expect(effectiveTracking(entry)).toBeUndefined()
      setProviderConfigSource({ load: async () => [row(true)] })
      await m.refreshProviderConfig({ force: true })
      expect(effectiveTracking(entry)?.network).toBe('param')
    })
  })
})

describe('ranking v2 — monetisation only breaks a tie', () => {
  it('an affiliate L4 page never outranks a direct L5 one; between equals the tracked link leads', () => {
    const req: CommerceRequest = { domain: 'travel', intentType: 'book_hotel', subject: 'Mường Thanh', configuration: { kind: 'hotel', propertyRef: 'm', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 } }
    const r = resolveCommerce(req, { hints: [
      { url: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/' },
      { url: 'https://www.agoda.com/vi-vn/muong-thanh-luxury-da-nang-hotel/hotel/da-nang-vn.html' },
      { url: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html' },
    ], now: NOW, enabled: true })
    // Trip.com's guest depth is 5 (its profile), Agoda and Booking.com 4; in this test Trip.com is untracked (no publisher id).
    const order = rankLinks(req, ('links' in r ? r.links : []).filter(l => l.depth >= 4), NOW).map(s => [s.link.providerId, s.link.depthProfile.guestDepth, s.link.tracking.mode])
    expect(order).toEqual([['tripcom', 5, 'none'], ['agoda', 4, 'affiliate'], ['booking', 4, 'none']])
  })
})
