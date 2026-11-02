import { describe, it, expect } from 'vitest'
import { agodaAdapter, mapProperty } from './agoda'
import { bookingDemandAdapter, mapAccommodation } from './bookingDemand'
import { adapterState, claimableAvailability, claimablePrice, missingInUrl, ownedUrl, PRICE_TTL_MS } from './common'
import { liveSentence, pageSentence, recheckBeforeHandoff, recheckSentence, resolveBooking, toCommerceRequest } from './resolve'
import { travelokaAdapter, vexereAdapter } from './skeletons'
import type { AdapterDeps, HttpPost, SearchCriteria, SearchResult } from './types'

const NOW = new Date('2026-10-06T10:00:00+07:00')
const now = () => NOW

// Test-only values: names the adapters read, with throwaway values (nothing real).
const BOOKING_ENV = { CCP_REALTIME_BOOKING: '1', BOOKING_DEMAND_API_BASE: 'https://demand.test/3.2', BOOKING_DEMAND_TOKEN: 'tok', BOOKING_DEMAND_AFFILIATE_ID: '1' }
const AGODA_ENV = { CCP_REALTIME_AGODA: '1', AGODA_DEMAND_API_BASE: 'https://agoda-api.test/search', AGODA_DEMAND_SITE_ID: '1', AGODA_DEMAND_KEY: 'k' }

const stay: SearchCriteria = {
  vertical: 'hotel',
  subject: 'Khách sạn Đà Lạt',
  context: { destination: 'Đà Lạt', checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2, rooms: 1, providerRefs: { booking: { cityRef: '1234567' }, agoda: { cityRef: '15932' } } },
}

// ── fixtures (shapes follow the public references; the mappers are deliberately tolerant — see each adapter's header) ──
const bookingSearch = {
  request_id: 'req-1',
  data: [
    { id: 4942635, name: 'The Luxe Hotel Da Lat', currency: 'VND', products: [
      { price: { total: 1_900_000 }, url: 'https://www.booking.com/hotel/vn/luxe.vi.html?checkin=2026-10-20&checkout=2026-10-22&group_adults=2&no_rooms=1' },
      { price: { total: 1_500_000 }, url: { web: 'https://www.booking.com/hotel/vn/luxe.vi.html?checkin=2026-10-20&checkout=2026-10-22&group_adults=2&no_rooms=1', app: 'https://www.booking.com/app/luxe' } },
    ] },
    { id: 777, currency: 'VND', products: [] },
  ],
}
const agodaSearch = {
  searchId: 's-1',
  properties: [
    { propertyId: 4942635, propertyName: 'The Luxe Hotel Da Lat', rooms: [
      { totalPayment: { inclusive: 2_100_000, currency: 'VND' }, remainingRooms: 3, landingUrl: 'https://www.agoda.com/partners/partnersearch.aspx?cid=1&hid=4942635&checkin=2026-10-20&checkout=2026-10-22&adults=2&rooms=1' },
      { totalPayment: { inclusive: 1_800_000, currency: 'VND' }, remainingRooms: 1, landingUrl: 'https://www.agoda.com/partners/partnersearch.aspx?cid=1&hid=4942635&checkin=2026-10-20&checkout=2026-10-22&adults=2&rooms=1' },
    ] },
  ],
}

const httpOk = (json: unknown): HttpPost => async () => ({ status: 200, json })
const deps = (env: Record<string, string>, http: HttpPost): AdapterDeps => ({ env, http, now })

describe('Booking.com Demand adapter', () => {
  it('maps search → normalized results: cheapest product, unified {web,app} url, validated hosts, context carried', async () => {
    const r = await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, httpOk(bookingSearch)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [a, sold] = r.value
    expect(a).toMatchObject({ provider: 'booking', vertical: 'hotel', providerItemId: '4942635', title: 'The Luxe Hotel Da Lat', price: 1_500_000, currency: 'VND', availabilityStatus: 'available', source: 'REALTIME_TAPPY', realtimeSource: 'booking-demand/accommodations.search', rawReference: 'booking:req-1:4942635' })
    expect(a.bookingUrl).toContain('checkin=2026-10-20')
    expect(a.deepLinkUrl).toBe('https://www.booking.com/app/luxe')
    expect(a.contextMissingInUrl).toEqual([]) // the URL carries checkin, checkout, adults, rooms
    expect(a.lastCheckedAt).toBe(NOW.toISOString())
    expect(sold.availabilityStatus).toBe('sold_out')
    expect(sold.price).toBeNull()
  })

  it('reads the older url + deep_link_url pair too (never assumes the field set)', () => {
    const r = mapAccommodation({ id: 5, currency: 'VND', products: [{ price: { book: '900000' }, url: 'https://www.booking.com/hotel/vn/x.html', deep_link_url: 'https://www.booking.com/app/x' }] }, stay, 'r', NOW, 'booking-demand/accommodations.availability')!
    expect(r.price).toBe(900_000)
    expect(r.deepLinkUrl).toBe('https://www.booking.com/app/x')
    expect(r.contextMissingInUrl).toEqual(['checkIn', 'checkOut', 'adults', 'rooms']) // the provider URL does not visibly carry the stay → told to the user
  })

  it('sends ids, never a destination name; asks for city id / children ages when missing', async () => {
    let sent: { url: string; body: Record<string, unknown> } | null = null
    const spy: HttpPost = async (url, init) => { sent = { url, body: init.body as Record<string, unknown> }; return { status: 200, json: bookingSearch } }
    await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, spy))
    expect(sent!.url).toBe('https://demand.test/3.2/accommodations/search')
    expect(sent!.body).toMatchObject({ checkin: '2026-10-20', checkout: '2026-10-22', city: 1234567, guests: { number_of_adults: 2, number_of_rooms: 1 }, extras: ['products'] })
    expect(JSON.stringify(sent!.body)).not.toContain('Đà Lạt')
    const noCity = await bookingDemandAdapter.search({ ...stay, context: { ...stay.context, providerRefs: { agoda: stay.context.providerRefs?.agoda } } }, deps(BOOKING_ENV, httpOk(bookingSearch)))
    expect(noCity).toMatchObject({ ok: false, reason: 'needs_location_id' })
    const kids = await bookingDemandAdapter.search({ ...stay, context: { ...stay.context, children: 1 } }, deps(BOOKING_ENV, httpOk(bookingSearch)))
    expect(kids).toMatchObject({ ok: false, reason: 'needs_children_ages' })
  })

  it('malformed, empty, auth failure, provider error and timeout are Outcomes — never a throw, never a leaked message', async () => {
    expect(await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, httpOk({ nope: 1 })))).toMatchObject({ ok: false, reason: 'malformed' })
    expect(await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, httpOk({ data: [] })))).toMatchObject({ ok: false, reason: 'empty' })
    expect(await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, httpOk({ data: [{ id: 'abc' }] })))).toMatchObject({ ok: false, reason: 'malformed' })
    expect(await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, async () => ({ status: 401, json: null })))).toMatchObject({ ok: false, reason: 'credentials_missing' })
    expect(await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, async () => ({ status: 500, json: null })))).toMatchObject({ ok: false, reason: 'provider_error' })
    const abort: HttpPost = async () => { const e = new Error('Bearer tok leaked'); e.name = 'AbortError'; throw e }
    const t = await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, abort))
    expect(t).toMatchObject({ ok: false, reason: 'timeout' })
    expect(JSON.stringify(t)).not.toContain('tok')
  })

  it('recheck: same price → ok · changed → price_changed · gone → unavailable', async () => {
    const item = (await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, httpOk(bookingSearch)))) as { ok: true; value: SearchResult[] }
    const picked = item.value[0]
    const avail = (price: number | null) => httpOk({ request_id: 'r2', data: { id: 4942635, currency: 'VND', products: price === null ? [] : [{ price: { total: price }, url: 'https://www.booking.com/hotel/vn/luxe.vi.html?checkin=2026-10-20&checkout=2026-10-22&group_adults=2&no_rooms=1' }] } })
    expect(await bookingDemandAdapter.recheck!(picked, stay, deps(BOOKING_ENV, avail(1_500_000)))).toMatchObject({ ok: true, value: { status: 'ok', currentPrice: 1_500_000 } })
    expect(await bookingDemandAdapter.recheck!(picked, stay, deps(BOOKING_ENV, avail(1_700_000)))).toMatchObject({ ok: true, value: { status: 'price_changed', previousPrice: 1_500_000, currentPrice: 1_700_000 } })
    expect(await bookingDemandAdapter.recheck!(picked, stay, deps(BOOKING_ENV, avail(null)))).toMatchObject({ ok: true, value: { status: 'unavailable', currentPrice: null, result: null } })
  })
})

describe('Agoda Search adapter', () => {
  it('maps properties → cheapest room, landingUrl (metaSearch), remaining rooms; always asks for metaSearch', async () => {
    let body: Record<string, unknown> | null = null
    const spy: HttpPost = async (_u, init) => { body = init.body as Record<string, unknown>; return { status: 200, json: agodaSearch } }
    const r = await agodaAdapter.search(stay, deps(AGODA_ENV, spy))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value[0]).toMatchObject({ provider: 'agoda', providerItemId: '4942635', price: 1_800_000, currency: 'VND', availability: 1, availabilityStatus: 'available', source: 'REALTIME_TAPPY', realtimeSource: 'agoda-search/properties.search', deepLinkUrl: null })
    expect(r.value[0].bookingUrl).toContain('hid=4942635')
    expect(r.value[0].contextMissingInUrl).toEqual([])
    expect((body as unknown as { features: { extra: string[] } }).features.extra).toContain('metaSearch')
    expect((body as unknown as { criteria: Record<string, unknown> }).criteria).toMatchObject({ cityId: 15932, checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2, rooms: 1, currency: 'VND' })
  })

  it('drops a poisoned landingUrl (foreign host, http, userinfo) but keeps the result', () => {
    const base = { propertyId: 1, rooms: [{ totalPayment: { inclusive: 1, currency: 'VND' }, landingUrl: '' }] }
    for (const bad of ['https://evil.example/x', 'http://www.agoda.com/x', 'https://u:p@www.agoda.com/x', 'javascript:alert(1)']) {
      const r = mapProperty({ ...base, rooms: [{ ...base.rooms[0], landingUrl: bad }] }, stay, 's', NOW)!
      expect(r.bookingUrl).toBeNull()
      expect(r.price).toBe(1)
    }
  })

  it('a price without a currency is no price; missing data degrades to nulls, never to a guess', () => {
    expect(mapProperty({ propertyId: 2, rooms: [{ totalPayment: { inclusive: 100 } }] }, stay, 's', NOW)!.price).toBeNull()
    expect(mapProperty({ propertyId: 3 }, stay, 's', NOW)).toMatchObject({ price: null, availabilityStatus: 'sold_out', bookingUrl: null })
    expect(mapProperty({ propertyId: 'x' }, stay, 's', NOW)).toBeNull()
  })

  it('recheck re-asks the same property: ok / price_changed / unavailable', async () => {
    const first = (await agodaAdapter.search(stay, deps(AGODA_ENV, httpOk(agodaSearch)))) as { ok: true; value: SearchResult[] }
    const picked = first.value[0]
    const withRoom = (inc: number) => httpOk({ searchId: 's-2', properties: [{ propertyId: 4942635, rooms: [{ totalPayment: { inclusive: inc, currency: 'VND' }, landingUrl: 'https://www.agoda.com/x' }] }] })
    expect(await agodaAdapter.recheck!(picked, stay, deps(AGODA_ENV, withRoom(1_800_000)))).toMatchObject({ ok: true, value: { status: 'ok' } })
    expect(await agodaAdapter.recheck!(picked, stay, deps(AGODA_ENV, withRoom(2_000_000)))).toMatchObject({ ok: true, value: { status: 'price_changed', currentPrice: 2_000_000 } })
    expect(await agodaAdapter.recheck!(picked, stay, deps(AGODA_ENV, httpOk({ searchId: 's-3', properties: [] })))).toMatchObject({ ok: true, value: { status: 'unavailable' } })
  })
})

describe('flags, credentials, freshness', () => {
  it('OFF by default; BLOCKED names only the missing env NAMES; READY needs flag + all credentials', () => {
    expect(adapterState(bookingDemandAdapter, {})).toEqual({ state: 'OFF', missing: [] })
    expect(adapterState(bookingDemandAdapter, { CCP_REALTIME_BOOKING: '1' })).toEqual({ state: 'BLOCKED_CREDENTIALS', missing: ['BOOKING_DEMAND_API_BASE', 'BOOKING_DEMAND_TOKEN', 'BOOKING_DEMAND_AFFILIATE_ID'] })
    expect(adapterState(bookingDemandAdapter, { ...BOOKING_ENV, CCP_REALTIME_BOOKING: 'true' }).state).toBe('OFF') // only the literal '1' switches a provider on
    expect(adapterState(bookingDemandAdapter, BOOKING_ENV).state).toBe('READY')
  })

  it('a price is claimable only inside its TTL; a stale or future timestamp is not evidence', () => {
    const fresh: SearchResult = { ...(mapAccommodation(bookingSearch.data[0], stay, 'r', NOW, 's') as SearchResult) }
    expect(claimablePrice(fresh, NOW)).toBe(1_500_000)
    expect(claimablePrice(fresh, new Date(NOW.getTime() + PRICE_TTL_MS + 1))).toBeNull()
    expect(claimablePrice({ ...fresh, lastCheckedAt: new Date(NOW.getTime() + 3_600_000).toISOString() }, NOW)).toBeNull()
    expect(claimablePrice({ ...fresh, source: 'PROVIDER_LIVE_PAGE' }, NOW)).toBeNull() // the two kinds of "live" are never conflated
    expect(claimableAvailability(fresh, new Date(NOW.getTime() + 10 * 60_000))).toBe('unknown')
  })

  it('wording: a number only with the check time; stale/page results say it is checked on the provider page — never "realtime"', () => {
    const fresh = mapAccommodation(bookingSearch.data[0], stay, 'r', NOW, 's') as SearchResult
    expect(liveSentence(fresh, NOW)).toMatch(/^1\.500\.000đ \(Tappy kiểm tra lúc 10:00\)/)
    const stale = liveSentence(fresh, new Date(NOW.getTime() + PRICE_TTL_MS + 60_000))
    expect(stale).toBe('Giá và tình trạng phòng được kiểm tra trên Booking.com khi bạn mở trang.')
    expect(`${stale} ${pageSentence('agoda')}`).not.toMatch(/realtime|thời gian thực/i)
    expect(recheckSentence({ status: 'price_changed', previousPrice: 1, currentPrice: 1_700_000, result: fresh }, 'booking')).toMatch(/Giá đã đổi còn 1\.700\.000đ/)
    expect(recheckSentence({ status: 'unavailable', previousPrice: 1, currentPrice: null, result: null }, 'agoda')).toMatch(/hết chỗ/)
    expect(recheckSentence({ status: 'unchecked', reason: 'off' }, 'agoda')).toBe(pageSentence('agoda'))
  })

  it('ownedUrl: https on the provider own registry hosts only', () => {
    expect(ownedUrl('booking', 'https://www.booking.com/hotel/vn/x.html')).toBeTruthy()
    expect(ownedUrl('booking', 'https://www.agoda.com/x')).toBeNull() // another provider's host
    expect(ownedUrl('agoda', 'ftp://www.agoda.com/x')).toBeNull()
    expect(missingInUrl(null, stay.context)).toEqual(['checkIn', 'checkOut', 'adults', 'rooms'])
  })
})

describe('skeletons (Traveloka, Vexere) — BLOCKED, never a guess', () => {
  it('answer unsupported even with credentials; never call the network', async () => {
    const boom: HttpPost = async () => { throw new Error('network must not be called') }
    const env = { CCP_REALTIME_TRAVELOKA: '1', TRAVELOKA_TPN_CLIENT_ID: 'a', TRAVELOKA_TPN_CLIENT_SECRET: 'b', TRAVELOKA_TPN_BASE_URL: 'https://x.test' }
    expect(adapterState(travelokaAdapter, env).state).toBe('READY')
    expect(await travelokaAdapter.search({ vertical: 'flight', subject: 'x', context: {} }, deps(env, boom))).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(await vexereAdapter.search({ vertical: 'bus', subject: 'x', context: {} }, deps({}, boom))).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(adapterState(vexereAdapter, { CCP_REALTIME_VEXERE: '1' })).toMatchObject({ state: 'BLOCKED_CREDENTIALS', missing: ['VEXERE_API_KEY', 'VEXERE_API_BASE_URL'] })
  })
})

describe('end to end — the fallback chain on the owner fixtures', () => {
  const links = (r: Awaited<ReturnType<typeof resolveBooking>>) => Object.fromEntries(r.links.map(l => [l.provider, l]))

  it('AGODA + BOOKING "Đà Lạt 20-22/10, 2 người", both READY → REALTIME_API with both providers, and the deeplink fallback still attached', async () => {
    const http: HttpPost = async url => ({ status: 200, json: url.includes('agoda-api') ? agodaSearch : bookingSearch })
    const r = await resolveBooking(stay, { env: { ...BOOKING_ENV, ...AGODA_ENV }, http, now })
    expect(r.level).toBe('REALTIME_API')
    expect(r.realtime.map(x => x.provider).sort()).toEqual(['agoda', 'booking', 'booking']) // Booking: the available property + the sold-out one
    expect(r.statuses.filter(s => s.provider !== 'traveloka').every(s => s.state === 'READY' && s.reason === null)).toBe(true)
    expect(r.statuses.find(s => s.provider === 'traveloka')?.state).toBe('OFF')
    expect(r.links.length).toBeGreaterThan(0)
  })

  it('flags OFF → DYNAMIC_DEEPLINK: Booking carries destination, dates and guests; Agoda carries city id + dates + guests (id-based grammar)', async () => {
    const r = await resolveBooking(stay, { env: {}, now })
    expect(r.level).toBe('DYNAMIC_DEEPLINK')
    expect(r.realtime).toEqual([])
    expect(r.statuses.map(s => `${s.provider}:${s.state}`).sort()).toEqual(['agoda:OFF', 'booking:OFF', 'traveloka:OFF'])
    const b = links(r).booking
    expect(b.level).toBe('DYNAMIC_DEEPLINK')
    const bq = new URL(b.directUrl).searchParams
    expect(Object.fromEntries(bq)).toEqual({ ss: 'Đà Lạt', checkin: '2026-10-20', checkout: '2026-10-22', group_adults: '2', no_rooms: '1', group_children: '0' })
    const a = links(r).agoda
    expect(a.level).toBe('DYNAMIC_DEEPLINK')
    expect(a.directUrl).toBe('https://www.agoda.com/search?city=15932&checkin=2026-10-20&checkout=2026-10-22&adults=2&rooms=1&los=2')
    expect(a.paramsPreserved).toEqual(expect.arrayContaining(['cityRef', 'checkIn', 'checkOut', 'adults', 'rooms']))
  })

  it('Agoda with a known hotel id adds selectedproperty (depth 3); without any id it falls back to the landing page (PROVIDER_PAGE) — never a guessed id', async () => {
    const withHotel = await resolveBooking({ ...stay, context: { ...stay.context, providerRefs: { agoda: { cityRef: '15932', propertyRefs: ['4942635'] } } } }, { env: {}, now })
    expect(links(withHotel).agoda.directUrl).toBe('https://www.agoda.com/search?city=15932&checkin=2026-10-20&checkout=2026-10-22&adults=2&rooms=1&los=2&selectedproperty=4942635')
    expect(links(withHotel).agoda.depth).toBe(3)
    const verified = await resolveBooking({ ...stay, context: { ...stay.context, providerRefs: undefined } }, { env: {}, now })
    expect(links(verified).agoda.directUrl).toContain('city=15932') // Đà Lạt is in the verified table
    const unknownCity = await resolveBooking({ ...stay, context: { ...stay.context, destination: 'Vũng Tàu', providerRefs: undefined } }, { env: {}, now })
    expect(links(unknownCity).agoda).toMatchObject({ directUrl: 'https://www.agoda.com/vi-vn/', level: 'PROVIDER_PAGE' })
  })

  it('credentials missing → BLOCKED (names only) and the deeplink fallback answers; timeout and malformed fall back the same way', async () => {
    const blocked = await resolveBooking(stay, { env: { CCP_REALTIME_AGODA: '1' }, now })
    expect(blocked.statuses.find(s => s.provider === 'agoda')).toMatchObject({ state: 'BLOCKED_CREDENTIALS', missing: ['AGODA_DEMAND_API_BASE', 'AGODA_DEMAND_SITE_ID', 'AGODA_DEMAND_KEY'] })
    expect(blocked.level).toBe('DYNAMIC_DEEPLINK')
    const abort: HttpPost = async () => { const e = new Error('x'); e.name = 'AbortError'; throw e }
    const timedOut = await resolveBooking(stay, { env: AGODA_ENV, http: abort, now })
    expect(timedOut.statuses.find(s => s.provider === 'agoda')).toMatchObject({ state: 'READY', reason: 'timeout' })
    expect(timedOut.level).toBe('DYNAMIC_DEEPLINK')
    const bad = await resolveBooking(stay, { env: AGODA_ENV, http: httpOk({ garbage: true }), now })
    expect(bad.statuses.find(s => s.provider === 'agoda')?.reason).toBe('malformed')
    expect(bad.realtime).toEqual([])
  })

  it('TRAVELOKA flight → dynamic fullsearch (route, date, guests, cabin); hotel → provider page (no composable search)', async () => {
    const flight = await resolveBooking({ vertical: 'flight', subject: 'SGN HAN', context: { origin: 'SGN', destination: 'HAN', departureDate: '2026-10-20', adults: 2, cabinClass: 'business' } }, { env: {}, now })
    const t = links(flight).traveloka
    expect(t.level).toBe('DYNAMIC_DEEPLINK')
    expect(t.directUrl).toBe('https://www.traveloka.com/vi-VN/flight/fullsearch?ap=SGN.HAN&dt=20-10-2026.null&ps=2.0.0&sc=BUSINESS')
    expect(flight.level).toBe('DYNAMIC_DEEPLINK')
    const hotel = await resolveBooking(stay, { env: {}, now })
    expect(links(hotel).traveloka?.level ?? 'PROVIDER_PAGE').toBe('PROVIDER_PAGE')
  })

  it('VEXERE "Sài Gòn → Đà Lạt": a discovered route page + date is the dynamic deeplink; with no route page the landing is the fallback (kept, never removed)', async () => {
    const bus: SearchCriteria = { vertical: 'bus', subject: 'Xe Sài Gòn Đà Lạt', context: { origin: 'Sài Gòn', destination: 'Đà Lạt', departureDate: '2026-10-20' } }
    const hinted = await resolveBooking(bus, { env: {}, now, hints: [{ url: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html' }] })
    expect(links(hinted).vexere).toMatchObject({ level: 'DYNAMIC_DEEPLINK', directUrl: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat-lam-dong-129t23991.html?date=20-10-2026' })
    const bare = await resolveBooking(bus, { env: {}, now })
    expect(links(bare).vexere).toMatchObject({ level: 'PROVIDER_PAGE', directUrl: 'https://vexere.com/vi-VN' })
  })

  it('recheckBeforeHandoff: unchecked when the adapter is OFF; price_changed through the chain', async () => {
    const picked = ((await bookingDemandAdapter.search(stay, deps(BOOKING_ENV, httpOk(bookingSearch)))) as { ok: true; value: SearchResult[] }).value[0]
    expect(await recheckBeforeHandoff(picked, stay, { env: {}, now })).toEqual({ status: 'unchecked', reason: 'off' })
    const changed = httpOk({ request_id: 'r', data: { id: 4942635, currency: 'VND', products: [{ price: { total: 1_650_000 }, url: 'https://www.booking.com/hotel/vn/luxe.vi.html' }] } })
    expect(await recheckBeforeHandoff(picked, stay, { env: BOOKING_ENV, http: changed, now })).toMatchObject({ status: 'price_changed', currentPrice: 1_650_000 })
  })

  it('toCommerceRequest: hotel / flight / bus map to the CCP shapes; cinema has no realtime path', () => {
    expect(toCommerceRequest(stay)).toMatchObject({ intentType: 'book_hotel', configuration: { kind: 'hotel', propertyRef: 'da-lat' }, constraints: { providerRefs: { agoda: { cityRef: '15932' } } } })
    expect(toCommerceRequest({ vertical: 'cinema', subject: 'x', context: {} })).toBeNull()
    expect(toCommerceRequest({ vertical: 'hotel', subject: 'x', context: {} })).toBeNull() // no dates → nothing to carry
  })

  it('REGRESSION: the shared hotel cityRef belongs to Trip.com — it is never used as an Agoda (or Booking) id', async () => {
    const { resolveCommerce } = await import('@/lib/ccp')
    const res = resolveCommerce({ domain: 'travel', intentType: 'book_hotel', subject: 'Nordic Resort', configuration: { kind: 'hotel', propertyRef: '10569789', cityRef: '42599', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 } }, { enabled: true, now: NOW })
    if (!('links' in res)) throw new Error('resolve failed')
    const agoda = res.links.find(l => l.providerId === 'agoda')!
    expect(agoda.directUrl).toBe('https://www.agoda.com/vi-vn/')
    expect(agoda.directUrl).not.toContain('42599')
    // and a request with the Agoda OWN id does compose the id-based grammar; a non-numeric id is rejected at the boundary
    const own = resolveCommerce({ domain: 'travel', intentType: 'book_hotel', subject: 'x', constraints: { providerRefs: { agoda: { cityRef: '15932' } } }, configuration: { kind: 'hotel', propertyRef: 'da-lat', checkIn: '2026-10-20', checkOut: '2026-10-22', adults: 2 } }, { enabled: true, now: NOW })
    expect('links' in own && own.links.find(l => l.providerId === 'agoda')?.directUrl).toBe('https://www.agoda.com/search?city=15932&checkin=2026-10-20&checkout=2026-10-22&adults=2&rooms=1&los=2')
    expect(resolveCommerce({ domain: 'travel', intentType: 'book_hotel', subject: 'x', constraints: { providerRefs: { agoda: { cityRef: '15932; DROP' } } } }, { enabled: true })).toMatchObject({ ok: false })
  })
})
