import { describe, it, expect, vi, afterEach } from 'vitest'
import { attachCommerceLinks } from './commerce'
import { orderLeadFirst, transportAsked, merchantOfLink, type PartnerEntry } from './partnerLinkSet'
import { SYSTEM_LINK_ROW_CAP, compactSystemLinks } from '@/lib/ai/consultative/systemLinkRow'

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Owner decision 17/11/2026: a HOTEL answer's partner row leads with Agoda, a FLIGHT / COACH / TRAIN answer's row leads with Vexere (our
// affiliates), and each row also carries 2-3 other platforms. Every link comes from the commerce layer (the tool result), in this order.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-11-17T03:00:00Z')
type Row = Record<string, unknown>
type L = { name: string; url: string; platform?: string }
const noSearch = vi.fn(async () => [])
const CITY_PAGE = 'https://vexere.com/vn/ve-tau-hoa/tu-ho-chi-minh-di-nha-trang-khanh-hoa.29.417.vi'
const COACH_PAGE = 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-nha-trang-khanh-hoa-129t23591.html'

afterEach(() => { vi.unstubAllEnvs() })

const linksOf = (r: Row): L[] => r.booking_links as L[]
const hostOf = (l: L) => new URL(l.url).hostname
const noDuplicateLabels = (links: L[]) => expect(new Set(links.map(l => l.name.trim().toLowerCase())).size).toBe(links.length)
const allHttps = (links: L[]) => { for (const l of links) expect(l.url.startsWith('https://'), l.url).toBe(true) }

describe('orderLeadFirst (pure)', () => {
  const e = (merchant: string, name: string, url = `https://${merchant}.example/${encodeURIComponent(name)}`): PartnerEntry => ({ merchant, name, url })

  it('lead first (capped), then one entry per other platform (capped), then the rest; a repeated label or URL and a non-https URL never pass', () => {
    const out = orderLeadFirst([
      e('booking', 'Booking.com'), e('agoda', 'A1'), e('agoda', 'A2'), e('agoda', 'A3'), e('traveloka', 'Traveloka'), e('tripcom', 'Trip.com'), e('booking', 'B2'),
      e('agoda', 'booking.com'), // repeated label (case-insensitive)
      { merchant: 'x', name: 'Plain http', url: 'http://x.example/' },
    ], 'agoda')
    expect(out.map(l => l.name)).toEqual(['A1', 'A2', 'Booking.com', 'Traveloka', 'Trip.com', 'A3', 'B2'])
  })

  it('merchants are read from a realtime link\'s platform label, else from the host', () => {
    expect(merchantOfLink({ platform: 'Agoda', url: 'https://x.example' })).toBe('agoda')
    expect(merchantOfLink({ url: 'https://www.booking.com/hotel/vn/x.html' })).toBe('booking')
    expect(merchantOfLink({ url: 'https://vn.trip.com/hotels/' })).toBe('tripcom')
  })

  it('the words decide coach vs train; neither (or both) = both', () => {
    expect(transportAsked('vé tàu Sài Gòn Nha Trang')).toEqual({ coach: false, train: true })
    expect(transportAsked(['đi Đà Lạt bằng xe khách giường nằm'])).toEqual({ coach: true, train: false })
    expect(transportAsked('đi từ Sài Gòn đến Nha Trang')).toEqual({ coach: true, train: true })
    expect(transportAsked('xe khách hay tàu hỏa')).toEqual({ coach: true, train: true })
  })
})

describe('HOTEL: Agoda first, then 2-3 other platforms', () => {
  const ctx = (extra: Row = {}) => ({ enabled: true, now: NOW, search: noSearch, location: 'Đà Lạt', checkIn: '2026-11-20', checkOut: '2026-11-22', ...extra }) as never

  it('dated stay, no realtime answer: Agoda (tracked) leads; Booking.com (dated destination page), Traveloka and Trip.com follow', async () => {
    const r: Row = { search_results: [], hotel_list: [] }
    await attachCommerceLinks('get_hotel_prices', r, ctx())
    const links = linksOf(r)
    expect(hostOf(links[0])).toBe('www.agoda.com')
    expect(links[0].url).toContain('cid=1974819') // the affiliate id stays on Agoda
    expect(links.slice(1, 4).map(hostOf)).toEqual(['www.booking.com', 'www.traveloka.com', 'vn.trip.com'])
    expect(links[1].url).toContain('checkin=2026-11-20') // the destination + the stay
    expect(links[1].url).not.toContain('cid=') // other platforms are plain links
    expect(links.length).toBe(4)
    expect(links.length - 1).toBeGreaterThanOrEqual(2)
    expect(links.length - 1).toBeLessThanOrEqual(3)
    noDuplicateLabels(links)
    allHttps(links)
    expect(Array.isArray(r._tappy_commerce)).toBe(true) // the marker streamEnrichment collects system links by
    expect(links.length).toBeLessThanOrEqual(SYSTEM_LINK_ROW_CAP)
    expect(compactSystemLinks(links)[0]).toBe(links[0])
  })

  it('realtime Agoda offers lead (recheck + booking link), the other platforms follow, and a second call on the memoised result does not duplicate anything', async () => {
    const LANDING = 'https://www.agoda.com/partners/partnersearch.aspx?cid=1974819&hid=4942635&checkin=2026-11-20&checkout=2026-11-22&adults=2&rooms=1'
    const env = { CCP_REALTIME_AGODA: '1', AGODA_DEMAND_API_BASE: 'https://agoda-api.test/search', AGODA_DEMAND_SITE_ID: '1', AGODA_DEMAND_KEY: 'secret-key-value' }
    const http = async () => ({ status: 200, json: { searchId: 's', properties: [{ propertyId: 4942635, propertyName: 'The Luxe Hotel Da Lat', rooms: [{ totalPayment: { inclusive: 1_800_000, currency: 'VND' }, remainingRooms: 2, landingUrl: LANDING }] }] } })
    const r: Row = { search_results: [], hotel_list: [] }
    const c = ctx({ platform: 'web', realtime: { env, http, now: () => NOW } })
    await attachCommerceLinks('get_hotel_prices', r, c)
    await attachCommerceLinks('get_hotel_prices', r, c)
    const links = linksOf(r)
    expect(links.slice(0, 2).map(l => l.platform)).toEqual(['Agoda', 'Agoda'])
    expect(links[1].url).toBe(LANDING)
    expect(links.slice(2, 5).map(hostOf)).toEqual(['www.booking.com', 'www.traveloka.com', 'vn.trip.com'])
    expect(links).toHaveLength(5)
    noDuplicateLabels(links)
    allHttps(links)
  })

  it('a turn that NAMES a platform keeps the narrowed behaviour: no partner row is added', async () => {
    const r: Row = { search_results: [], hotel_list: [] }
    await attachCommerceLinks('get_hotel_prices', r, ctx({ userText: 'đặt khách sạn Đà Lạt trên Traveloka' }))
    expect(r.booking_links).toBeUndefined()
  })
})

describe('FLIGHT: Vexere first, then 2-3 other platforms', () => {
  const ctx = { enabled: true, now: NOW, search: noSearch, origin: 'Sài Gòn', destination: 'Hà Nội', departDate: '2026-11-25' } as never

  it('with the Vexere direct programme ON the Vexere flights page (aid 380) leads; Trip.com and Traveloka dated fare lists follow', async () => {
    vi.stubEnv('VEXERE_DIRECT_AFFILIATE', '1')
    const r: Row = { origin: 'SGN', destination: 'HAN', fare_status: 'not_verified', booking_links: [{ name: 'Trip.com', url: 'https://vn.trip.com/flights/old' }] }
    await attachCommerceLinks('get_flight_prices', r, ctx)
    const links = linksOf(r)
    expect(hostOf(links[0])).toBe('vexere.com')
    expect(links[0].url).toContain('aid=380')
    expect(links[0].name).toMatch(/Vexere/)
    expect(links.slice(1).map(hostOf)).toEqual(['vn.trip.com', 'www.traveloka.com'])
    expect(links[1].url).toContain('ddate=2026-11-25')
    expect(links[1].url).not.toContain('aid=')
    expect(links.length - 1).toBeGreaterThanOrEqual(2)
    expect(links.length - 1).toBeLessThanOrEqual(3)
    noDuplicateLabels(links)
    allHttps(links)
  })

  it('with the programme OFF no unaffiliated Vexere flights button is invented: the CCP fare lists stand as before', async () => {
    const r: Row = { origin: 'SGN', destination: 'HAN', booking_links: [] }
    await attachCommerceLinks('get_flight_prices', r, ctx)
    expect(linksOf(r).map(hostOf)).toEqual(['vn.trip.com', 'www.traveloka.com'])
  })
})

describe('COACH and TRAIN: Vexere first, then 2-3 other platforms', () => {
  const search = vi.fn(async (q: string) => q.includes('site:vexere.com/vi-VN') ? [{ title: 'Vé xe', link: COACH_PAGE, snippet: '' }] : [])
  const base = { enabled: true, now: NOW, search, origin: 'Sài Gòn', destination: 'Nha Trang', departDate: '2026-11-25', transportMode: 'intercity' }
  const result = (): Row => ({ type: 'intercity', bus_search_results: [], train_search_results: [{ title: 'Vé tàu Hồ Chí Minh Nha Trang', link: CITY_PAGE, snippet: '' }] })

  it('a coach question: the Vexere route page (dated) leads; FUTA Bus Lines and Baolau follow', async () => {
    const r = result()
    await attachCommerceLinks('get_transport_options', r, { ...base, userText: 'vé xe khách Sài Gòn Nha Trang' } as never)
    const links = linksOf(r)
    expect(links[0].name).toBe('Vexere')
    expect(links[0].url).toContain('129t23591.html?date=25-11-2026')
    expect(links.slice(1).map(hostOf)).toEqual(['futabus.vn', 'www.baolau.com'])
    expect(r.vexere_link).toBe(links[0].url) // the single-link field is unchanged
    noDuplicateLabels(links)
    allHttps(links)
  })

  it('a train question: Vexere\'s dated train list leads; the railway\'s own site (dsvn.vn) and Baolau follow; no coach link in a train-only answer', async () => {
    const r = result()
    await attachCommerceLinks('get_transport_options', r, { ...base, userText: 'vé tàu hỏa Sài Gòn Nha Trang' } as never)
    const links = linksOf(r)
    expect(links[0].name).toBe('Vexere') // a train-only row keeps the plain merchant name
    expect(links[0].url).toBe(r.train_booking_link)
    expect(links.slice(1).map(hostOf)).toEqual(['dsvn.vn', 'www.baolau.com'])
    expect(links.some(l => l.url.includes('129t23591'))).toBe(false)
    noDuplicateLabels(links)
    allHttps(links)
  })

  it('no word for either: coach group then train group, Vexere first, within the row cap, no duplicate label or URL', async () => {
    const r = result()
    await attachCommerceLinks('get_transport_options', r, { ...base, userText: 'đi từ Sài Gòn đến Nha Trang' } as never)
    const links = linksOf(r)
    expect(links[0].name).toBe('Vexere')
    expect(links.map(hostOf)).toEqual(['vexere.com', 'futabus.vn', 'www.baolau.com', 'vexere.com', 'dsvn.vn'])
    expect(links[3].name).toBe('Vexere (vé tàu)') // distinct from the coach "Vexere" so the row's one-per-label rule keeps both
    expect(new Set(links.map(l => l.url)).size).toBe(links.length)
    noDuplicateLabels(links)
    allHttps(links)
    expect(links.length).toBeLessThanOrEqual(SYSTEM_LINK_ROW_CAP)
  })

  it('no dated route page found: Vexere\'s own front door (CCP, tracked) still leads and is labelled as a home page', async () => {
    const r: Row = { type: 'intercity', bus_search_results: [] }
    await attachCommerceLinks('get_transport_options', r, { ...base, search: noSearch, userText: 'xe khách Sài Gòn Nha Trang' } as never)
    const links = linksOf(r)
    expect(hostOf(links[0]) === 'vexere.com' || links[0].url.includes('vexere')).toBe(true)
    expect(links[0].name).toMatch(/Vexere \(trang chủ\)/)
    expect(links.slice(1).map(hostOf)).toEqual(['futabus.vn', 'www.baolau.com'])
    expect(r.vexere_link).toBeUndefined()
  })
})
