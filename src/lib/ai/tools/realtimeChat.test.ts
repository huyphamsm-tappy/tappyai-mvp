import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachCommerceLinks } from './commerce'
import { nowShowingLinks } from '@/lib/ai/agent/agentTools'
import type { HttpPost } from '@/lib/providers/realtime/types'

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Realtime booking layer IN THE CHAT FLOW — the seam every booking tool passes through (attachCommerceLinks).
// user prompt → tool → realtime adapter (fixture HTTP, never a real provider) → normalized offers → result the model/streamEnrichment reads → CTA.
// CI never calls a provider: `realtime.http` is a fixture and `realtime.env` carries throwaway values.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-06T10:00:00+07:00')
type Row = Record<string, unknown>
const noSearch = vi.fn(async () => [])

const AGODA_ENV = { CCP_REALTIME_AGODA: '1', AGODA_DEMAND_API_BASE: 'https://agoda-api.test/search', AGODA_DEMAND_SITE_ID: '1', AGODA_DEMAND_KEY: 'secret-key-value' }
const BOOKING_ENV = { CCP_REALTIME_BOOKING: '1', BOOKING_DEMAND_API_BASE: 'https://demand.test/3.2', BOOKING_DEMAND_TOKEN: 'secret-token-value', BOOKING_DEMAND_AFFILIATE_ID: '1' }
const ALL_ON = { ...AGODA_ENV, ...BOOKING_ENV, CCP_REALTIME_TRAVELOKA: '1', TRAVELOKA_TPN_CLIENT_ID: 'a', TRAVELOKA_TPN_CLIENT_SECRET: 'b', TRAVELOKA_TPN_BASE_URL: 'https://x.test', CCP_REALTIME_VEXERE: '1', VEXERE_API_KEY: 'k', VEXERE_API_BASE_URL: 'https://y.test' }

const LANDING = 'https://www.agoda.com/partners/partnersearch.aspx?cid=1&hid=4942635&checkin=2026-10-20&checkout=2026-10-22&adults=2&rooms=1'
const agodaSearch = (inclusive = 1_800_000) => ({ searchId: 's-1', properties: [{ propertyId: 4942635, propertyName: 'The Luxe Hotel Da Lat', rooms: [{ totalPayment: { inclusive, currency: 'VND' }, remainingRooms: 2, landingUrl: LANDING }] }] })
const httpOk = (json: unknown): HttpPost => async () => ({ status: 200, json })

const hotelCtx = (realtime: Row): Record<string, unknown> => ({ enabled: true, now: NOW, search: noSearch, location: 'Đà Lạt', checkIn: '2026-10-20', checkOut: '2026-10-22', realtime })
const hotelResult = (): Row => ({ search_results: [], hotel_list: [] })

let logs: string[]
beforeEach(() => { logs = []; vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) }) })
afterEach(() => { vi.restoreAllMocks() })
const realtimeLogs = () => logs.filter(l => l.includes('tappyai_realtime')).map(l => JSON.parse(l))

describe('A. "khách sạn Đà Lạt 20-22/10 cho 2 người"', () => {
  it('realtime disabled (no flag): the tool result is untouched — nothing realtime is added, nothing is logged', async () => {
    const r = hotelResult()
    const before = JSON.stringify(r)
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: {} }) as never)
    expect(JSON.stringify(r)).toBe(before)
    expect(realtimeLogs()).toEqual([])
  })

  it('credentials missing: BLOCKED is logged (provider + reason only), the result is untouched, no error', async () => {
    const r = hotelResult()
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: { CCP_REALTIME_AGODA: '1' } }) as never)
    expect(r.realtime_results).toBeUndefined()
    expect(r.booking_links).toBeUndefined()
    expect(realtimeLogs()).toEqual([{ type: 'tappyai_realtime', provider: 'agoda', step: 'attach', ok: false, reason: 'credentials_missing' }])
  })

  it('adapter unavailable (Booking READY but no Booking city id for Đà Lạt): falls back with reason needs_location_id — never another provider\'s id', async () => {
    const sent: Array<Record<string, unknown>> = []
    const spy: HttpPost = async (_u, init) => { sent.push(init.body as Record<string, unknown>); return { status: 200, json: {} } }
    const r = hotelResult()
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: BOOKING_ENV, http: spy }) as never)
    expect(sent).toEqual([]) // no call was made: the destination has no Booking id
    expect(r.realtime_results).toBeUndefined()
    expect(realtimeLogs()[0]).toMatchObject({ provider: 'booking', step: 'search', ok: false, reason: 'needs_location_id' })
  })

  it('realtime success (Agoda, verified Đà Lạt id): price + time + CTA, dates and guests carried, evidence for the price guards, no "realtime" wording', async () => {
    let body: { criteria: Record<string, unknown> } | null = null
    const spy: HttpPost = async (_u, init) => { body = init.body as { criteria: Record<string, unknown> }; return { status: 200, json: agodaSearch() } }
    const r = hotelResult()
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: AGODA_ENV, http: spy, now: () => NOW }) as never)
    // the request used AGODA's own city id and the stay — not a Trip.com id, not a name
    expect(body!.criteria).toMatchObject({ cityId: 15932, checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2, rooms: 1 })
    const rows = r.realtime_results as Row[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ provider: 'Agoda', name: 'The Luxe Hotel Da Lat', price: 1_800_000, currency: 'VND', price_text: '1.800.000đ', checked_at: '10:00', availability_status: 'available', rooms_left: 2, for_guests: '2 người (mặc định)' })
    expect(rows[0].booking_url).toBe(LANDING) // context preserved: checkin, checkout, adults, rooms are all in the provider URL
    expect(rows[0].context_missing_in_url).toBeUndefined()
    expect(rows[0].sentence).toMatch(/Tappy kiểm tra lúc 10:00/)
    // CTA: the system link channel (streamEnrichment appends these when the model does not copy them)
    expect(r.booking_links).toEqual([{ name: 'The Luxe Hotel Da Lat — 1.800.000đ, kiểm tra lúc 10:00', platform: 'Agoda', url: LANDING, _realtime: true }])
    expect(Array.isArray(r._tappy_commerce)).toBe(true)
    expect(r.price_search_results).toEqual([expect.objectContaining({ evidence_scope: 'entity', evidence_about: 'The Luxe Hotel Da Lat', link: LANDING })])
    const note = String(r.realtime_note)
    expect(note).toMatch(/kiểm tra lúc/)
    expect(note).toMatch(/KHÔNG dùng chữ "realtime"/)
    expect(note).toMatch(/mặc định/) // adults were not stated → said to the user
    expect(realtimeLogs().find(l => l.step === 'attach')).toMatchObject({ provider: 'agoda', ok: true, results: 1 })
  })

  it('realtime timeout: the result is untouched and the fallback reason is logged', async () => {
    const abort: HttpPost = async () => { const e = new Error('slow'); e.name = 'AbortError'; throw e }
    const r = hotelResult()
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: AGODA_ENV, http: abort }) as never)
    expect(r.realtime_results).toBeUndefined()
    expect(realtimeLogs().find(l => l.step === 'attach')).toMatchObject({ provider: 'agoda', ok: false, reason: 'timeout' })
  })

  it('stale result (checked 20 min before it is shown): listed WITHOUT a price; the page re-checks; no price evidence', async () => {
    const r = hotelResult()
    const earlier = new Date(NOW.getTime() - 20 * 60_000)
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: AGODA_ENV, http: httpOk(agodaSearch()), now: () => earlier }) as never)
    const row = (r.realtime_results as Row[])[0]
    expect(row.price).toBeUndefined()
    expect(row.price_text).toBeUndefined()
    expect(row.sentence).toBe('Giá và tình trạng phòng được kiểm tra trên Agoda khi bạn mở trang.')
    expect((r.booking_links as Row[])[0].name).toBe('The Luxe Hotel Da Lat') // no number in the label
    expect(r.price_search_results).toBeUndefined()
    expect(String(r.realtime_note)).toMatch(/KHÔNG có giá/)
  })

  it('an explicit party size is used as stated (not flagged as a default); a sold-out property is not offered', async () => {
    const r = hotelResult()
    const ctx = { ...hotelCtx({ env: AGODA_ENV, http: httpOk({ searchId: 's', properties: [{ propertyId: 4942635, propertyName: 'X', rooms: [] }] }), now: () => NOW }), passengers: 3 } as never
    await attachCommerceLinks('get_hotel_prices', r, ctx)
    expect(r.realtime_results).toBeUndefined() // sold out → nothing to offer, the existing flow stands
    const r2 = hotelResult()
    await attachCommerceLinks('get_hotel_prices', r2, { ...hotelCtx({ env: AGODA_ENV, http: httpOk(agodaSearch()), now: () => NOW }), passengers: 3 } as never)
    expect((r2.realtime_results as Row[])[0].for_guests).toBe('3 người')
    expect(String(r2.realtime_note)).not.toMatch(/mặc định/)
  })

  it('idempotent on a memoised tool result: a second turn replaces the realtime attachment, never duplicates it', async () => {
    const r = hotelResult()
    const ctx = hotelCtx({ env: AGODA_ENV, http: httpOk(agodaSearch()), now: () => NOW })
    await attachCommerceLinks('get_hotel_prices', r, ctx)
    await attachCommerceLinks('get_hotel_prices', r, ctx)
    expect(r.booking_links).toHaveLength(1)
    expect(r.price_search_results).toHaveLength(1)
    expect(r.realtime_results).toHaveLength(1)
    // …and switching the flag off between turns removes it
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: {} }) as never)
    expect(r.realtime_results).toBeUndefined()
    expect(r.booking_links).toEqual([])
  })

  it('an undated question has no realtime search (a price needs dates); an unmapped city falls back; logs never carry a credential', async () => {
    const noDates = hotelResult()
    await attachCommerceLinks('get_hotel_prices', noDates, { enabled: true, now: NOW, search: noSearch, location: 'Đà Lạt', realtime: { env: AGODA_ENV, http: httpOk(agodaSearch()) } } as never)
    expect(noDates.realtime_results).toBeUndefined()
    const otherCity = hotelResult()
    await attachCommerceLinks('get_hotel_prices', otherCity, { ...hotelCtx({ env: AGODA_ENV, http: httpOk(agodaSearch()) }), location: 'Vũng Tàu' } as never)
    expect(otherCity.realtime_results).toBeUndefined()
    expect(logs.join('\n')).not.toMatch(/secret-key-value|secret-token-value|authorization|Bearer/i)
  })

  it('the existing booking flow is not replaced: Booking + Agoda + Trip.com enabled with a mapped city still leave search_results/hotel_list as the tool built them', async () => {
    const r: Row = { search_results: [{ name: 'Hotel A', link: 'https://www.booking.com/hotel/vn/a.vi.html' }], hotel_list: [{ name: 'Hotel A' }], booking_link: 'https://legacy.example/b' }
    await attachCommerceLinks('get_hotel_prices', r, hotelCtx({ env: AGODA_ENV, http: httpOk(agodaSearch()), now: () => NOW }) as never)
    expect((r.search_results as Row[])[0].name).toBe('Hotel A')
    expect(r.booking_link).toBe('https://legacy.example/b')
    expect(r.realtime_results).toBeDefined() // enhancement, alongside
  })
})

describe('B. "vé SGN-HAN 20/10"', () => {
  const flight = async (env: Record<string, string>, http?: HttpPost) => {
    const result: Row = { origin: 'SGN', destination: 'HAN', fare_status: 'not_verified', booking_links: [] }
    await attachCommerceLinks('get_flight_prices', result, { enabled: true, now: NOW, search: noSearch, origin: 'Sài Gòn', destination: 'Hà Nội', departDate: '2026-10-20', passengers: 1, realtime: { env, http } } as never)
    return result
  }

  it('every provider switched ON (Traveloka has no mapped API yet): the dynamic deeplinks are EXACTLY what they were — context preserved, CTA intact, no realtime claim', async () => {
    const boom: HttpPost = async () => { throw new Error('flight APIs must not be called: no schema is mapped') }
    const off = await flight({})
    const on = await flight(ALL_ON, boom)
    expect(on.booking_links).toEqual(off.booking_links)
    expect(on.realtime_results).toBeUndefined()
    const urls = (on.booking_links as Array<{ url: string }>).map(l => l.url)
    expect(urls).toContain('https://www.traveloka.com/vi-VN/flight/fullsearch?ap=SGN.HAN&dt=20-10-2026.null&ps=1.0.0&sc=ECONOMY')
    expect(urls.some(u => u.includes('dcity=sgn') && u.includes('acity=han') && u.includes('ddate=2026-10-20'))).toBe(true)
    expect(on.fare_status).toBe('not_verified') // the honest "chưa xác minh giá" stands
  })
})

describe('C. "xe Sài Gòn Đà Lạt"', () => {
  it('Vexere ON without a mapped API: the route-page deeplink with the date is unchanged and no realtime is claimed', async () => {
    const search = vi.fn(async () => [{ title: 'Vé xe khách Sài Gòn đi Đà Lạt', link: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html', snippet: '' }])
    const run = async (env: Record<string, string>) => {
      const result: Row = { type: 'intercity', bus_search_results: [] }
      await attachCommerceLinks('get_transport_options', result, { enabled: true, now: NOW, search, origin: 'Sài Gòn', destination: 'Đà Lạt', departDate: '2026-10-20', transportMode: 'intercity', realtime: { env, http: async () => { throw new Error('no vexere API is mapped') } } } as never)
      return result
    }
    const off = await run({})
    const on = await run(ALL_ON)
    expect(on.vexere_link).toBe(off.vexere_link)
    expect(String(on.vexere_link)).toContain('vexere.com')
    expect(on.realtime_results).toBeUndefined()
  })
})

describe('D. "phim đang chiếu"', () => {
  it('has a cinema CTA from the chains\' own pages and no realtime claim (no provider answers showtimes)', () => {
    const r = nowShowingLinks('vi')
    expect(r.film_links.map(l => l.platform)).toEqual(['CGV', 'Galaxy Cinema', 'Lotte Cinema', 'BHD Star', 'Beta Cinemas'])
    expect(r.film_links.every(l => l.url.startsWith('https://') && l.name === 'Xem lịch chiếu / đặt vé')).toBe(true)
  })
})

// ── E. the whole user path with a mocked provider: search → realtime result → recheck → booking CTA ──────────────────────────────────────────
import { NextRequest } from 'next/server'
import { POST as recheckRoute } from '@/app/api/booking/recheck/route'
import { parseRecheckHref, runRecheck } from '@/lib/providers/realtime/recheckLink'

describe('E. hotel end to end (web): search → realtime result → recheck → CTA', () => {
  const KEYS = Object.keys(AGODA_ENV)
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; process.env[k] = (AGODA_ENV as Record<string, string>)[k] } })
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }; vi.unstubAllGlobals() })

  /** The browser's fetch → the real route; the route's provider call → the fixture provider (price per call). */
  const wire = (providerPrice: () => number | null) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/booking/recheck')) {
        return recheckRoute(new NextRequest('http://localhost/api/booking/recheck', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.9.9', 'x-real-ip': '10.9.9.9' }, body: String(init?.body) }))
      }
      const price = providerPrice()
      return new Response(JSON.stringify(price === null ? { searchId: 's', properties: [] } : agodaSearch(price)), { status: 200 })
    }))
  }

  const search = async (platform: 'web' | 'android') => {
    const r = hotelResult()
    await attachCommerceLinks('get_hotel_prices', r, { ...hotelCtx({ env: AGODA_ENV, http: httpOk(agodaSearch(1_800_000)), now: () => NOW }), platform } as never)
    return r
  }

  it('web: the result carries [recheck link, booking CTA]; the recheck answers unchanged / changed / unavailable; the CTA is the provider page with the stay', async () => {
    const r = await search('web')
    const links = r.booking_links as Array<{ name: string; url: string }>
    expect(links.map(l => l.name)).toEqual(['Kiểm tra giá & tình trạng: The Luxe Hotel Da Lat', 'The Luxe Hotel Da Lat — 1.800.000đ, kiểm tra lúc 10:00'])
    const recheckHref = links[0].url
    expect(parseRecheckHref(recheckHref)).toMatchObject({ provider: 'agoda', providerItemId: '4942635', previousPrice: 1_800_000, stay: { destination: 'Đà Lạt', checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2 } })
    expect(links[1].url).toBe(LANDING)

    let price: number | null = 1_800_000
    wire(() => price)
    expect(await runRecheck(recheckHref)).toMatchObject({ status: 'ok', bookingUrl: LANDING })
    price = 2_000_000
    expect(await runRecheck(recheckHref)).toMatchObject({ status: 'price_changed', sentence: expect.stringMatching(/Giá đã đổi còn 2\.000\.000đ/), bookingUrl: LANDING })
    price = null
    const gone = await runRecheck(recheckHref)
    expect(gone).toMatchObject({ status: 'unavailable', sentence: expect.stringMatching(/hết chỗ/) })
    expect(gone?.bookingUrl).toBeUndefined() // nothing to book → no CTA offered by the recheck
  })

  it('native clients get NO recheck link (never a dead link): only the booking CTA', async () => {
    const r = await search('android')
    expect((r.booking_links as Array<{ name: string }>).map(l => l.name)).toEqual(['The Luxe Hotel Da Lat — 1.800.000đ, kiểm tra lúc 10:00'])
  })

  it('a provider with no recheck (flag ON, no mapped API) shows no fake recheck button: flights/bus keep dynamic deeplink → provider page only', async () => {
    const f: Row = { origin: 'SGN', destination: 'HAN', booking_links: [] }
    await attachCommerceLinks('get_flight_prices', f, { enabled: true, now: NOW, search: noSearch, origin: 'Sài Gòn', destination: 'Hà Nội', departDate: '2026-10-20', platform: 'web', realtime: { env: ALL_ON, http: async () => { throw new Error('no flight API') } } } as never)
    expect((f.booking_links as Array<{ name: string }>).some(l => /Kiểm tra giá/.test(l.name))).toBe(false)
    expect(f.realtime_results).toBeUndefined()
  })
})
