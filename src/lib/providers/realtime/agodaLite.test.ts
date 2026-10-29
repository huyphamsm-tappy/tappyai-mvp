import { describe, it, expect } from 'vitest'
import { AGODA_LITE_URL, agodaLiteAdapter, mapLiteHotel } from './agodaLite'
import { adapterState } from './common'
import { verifiedRefsFor } from './locations'
import { REALTIME_ADAPTERS, resolveBooking } from './resolve'
import type { AdapterDeps, HttpPost, SearchCriteria } from './types'

// 30/10: the Agoda Affiliate Lite API, mapped from Affiliate_Lite_API_V2.0.pdf (request / response examples and schema). No network here:
// every call goes through the injected HttpPost. The env values below are throwaway test values, not credentials.
const NOW = new Date('2026-10-30T10:00:00+07:00')
const ENV = { CCP_REALTIME_AGODA_LITE: '1', AGODA_LITE_SITE_ID: '111', AGODA_LITE_API_KEY: 'test-key' }
const stay: SearchCriteria = {
  vertical: 'hotel', subject: 'Khách sạn Hội An', currency: 'VND',
  context: { destination: 'Hội An', checkIn: '2026-11-22', checkOut: '2026-11-24', adults: 2, rooms: 1, providerRefs: { agoda: { cityRef: '16552' } } },
}
const LANDING = (hid: number) => `https://www.agoda.com/partners/partnersearch.aspx?cid=1974819&hid=${hid}&currency=VND&checkin=2026-11-22&checkout=2026-11-24&NumberofAdults=2&NumberofChildren=0&Rooms=1`
// The PDF's response example, in VND and with the fields of its schema.
const RESULTS = {
  results: [
    { hotelId: 463019, hotelName: 'Hoi An Riverside Hotel', dailyRate: 850000, crossedOutRate: 1200000, discountPercentage: 29, currency: 'VND', starRating: 4, reviewScore: 8.6, reviewCount: 1234, imageURL: 'http://pix6.agoda.net/x.jpg', includeBreakfast: true, freeWifi: true, landingURL: LANDING(463019) },
    { hotelId: 1144213, hotelName: 'Old Town Homestay', dailyRate: 420000, crossedOutRate: 420000, discountPercentage: 0, currency: 'VND', starRating: 2.5, reviewScore: 9.1, reviewCount: 88, landingURL: 'https://evil.example/partnersearch.aspx?hid=1144213' },
  ],
}
const deps = (http: HttpPost, env: Record<string, string> = ENV): AdapterDeps => ({ env, http, now: () => NOW })
const httpOk = (json: unknown): HttpPost => async () => ({ status: 200, json })

describe('Agoda Lite adapter — request', () => {
  it('posts over HTTPS with "site:key" auth and the PDF body: city id, dates, occupancy, VND, vi-vn; never the destination name', async () => {
    let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null
    const spy: HttpPost = async (url, init) => { sent = { url, headers: init.headers, body: init.body as Record<string, unknown> }; return { status: 200, json: RESULTS } }
    await agodaLiteAdapter.search(stay, deps(spy))
    expect(sent!.url).toBe(AGODA_LITE_URL)
    expect(sent!.url.startsWith('https://')).toBe(true)
    expect(sent!.headers.authorization).toBe('111:test-key')
    expect(sent!.body).toEqual({ criteria: {
      additional: { currency: 'VND', language: 'vi-vn', discountOnly: false, occupancy: { numberOfAdult: 2, numberOfChildren: 0 }, maxResult: 10, sortBy: 'Recommended' },
      checkInDate: '2026-11-22', checkOutDate: '2026-11-24', cityId: 16552,
    } })
    expect(JSON.stringify(sent!.body)).not.toContain('Hội An')
  })
  it('a key pasted as the portal copies it ("<site>:<key>") is read as that pair, not sent twice (measured 30/10: 401, error 108)', async () => {
    const seen: string[] = []
    const spy: HttpPost = async (_u, init) => { seen.push(init.headers.authorization); return { status: 200, json: RESULTS } }
    await agodaLiteAdapter.search(stay, deps(spy, { ...ENV, AGODA_LITE_API_KEY: '111:test-key' }))
    await agodaLiteAdapter.search(stay, deps(spy, { ...ENV, AGODA_LITE_SITE_ID: ' 111 ', AGODA_LITE_API_KEY: ' test-key ' }))
    // another site's pair is not taken apart
    await agodaLiteAdapter.search(stay, deps(spy, { ...ENV, AGODA_LITE_API_KEY: '222:test-key' }))
    expect(seen).toEqual(['111:test-key', '111:test-key', '111:222:test-key'])
  })
  it('asks by hotel ids when it holds them (the hotel list search: no city, no maxResult / sortBy)', async () => {
    let body: Record<string, unknown> | null = null
    const spy: HttpPost = async (_u, init) => { body = init.body as Record<string, unknown>; return { status: 200, json: RESULTS } }
    await agodaLiteAdapter.search({ ...stay, context: { ...stay.context, providerRefs: { agoda: { cityRef: '16552', propertyRefs: ['463019', 'x'] } } } }, deps(spy))
    const c = (body as unknown as { criteria: Record<string, unknown> }).criteria
    expect(c.hotelId).toEqual([463019])
    expect(c.cityId).toBeUndefined()
    expect((c.additional as Record<string, unknown>).maxResult).toBeUndefined()
  })
  it('refuses what it cannot ask: no city / hotel id, children without ages, missing dates', async () => {
    const never: HttpPost = async () => { throw new Error('must not be called') }
    expect(await agodaLiteAdapter.search({ ...stay, context: { ...stay.context, providerRefs: undefined } }, deps(never))).toMatchObject({ ok: false, reason: 'needs_location_id' })
    expect(await agodaLiteAdapter.search({ ...stay, context: { ...stay.context, children: 1 } }, deps(never))).toMatchObject({ ok: false, reason: 'needs_children_ages' })
    expect(await agodaLiteAdapter.search({ ...stay, context: { ...stay.context, checkOut: undefined } }, deps(never))).toMatchObject({ ok: false, reason: 'unsupported' })
  })
})

describe('Agoda Lite adapter — response', () => {
  it('maps a row: nightly rate in VND, the tracked partnersearch link kept whole, stars / score / "before taxes" in the subtitle', async () => {
    const r = await agodaLiteAdapter.search(stay, deps(httpOk(RESULTS)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [a, b] = r.value
    expect(a).toMatchObject({ provider: 'agoda', vertical: 'hotel', providerItemId: '463019', title: 'Hoi An Riverside Hotel', price: 850000, currency: 'VND', availability: null, availabilityStatus: 'available', source: 'REALTIME_TAPPY', realtimeSource: 'agoda-lite/lt_v1', lastCheckedAt: NOW.toISOString(), rawReference: 'agoda-lite:463019' })
    expect(a.bookingUrl).toBe(LANDING(463019))
    expect(a.contextMissingInUrl).toEqual([]) // checkin, checkout, NumberofAdults, Rooms all carried
    expect(a.subtitle).toBe('4★ · 8,6/10 (1.234 đánh giá) · giá/đêm chưa gồm thuế, phí')
    // a landing URL off Agoda's own hosts is dropped, the offer stays (the user gets the deeplink fallback)
    expect(b.bookingUrl).toBeNull()
    expect(b.price).toBe(420000)
  })
  it('a row with no id is dropped; a row with no rate states no price and no availability', () => {
    expect(mapLiteHotel({ hotelName: 'x', dailyRate: 1 }, stay, NOW)).toBeNull()
    const noRate = mapLiteHotel({ hotelId: 5, hotelName: 'y', currency: 'VND' }, stay, NOW)!
    expect(noRate.price).toBeNull()
    expect(noRate.currency).toBeNull()
    expect(noRate.availabilityStatus).toBe('unknown')
  })
  it('error 911 "No search result" is empty, not a failure; any other error id, 401 and garbage are failures', async () => {
    expect(await agodaLiteAdapter.search(stay, deps(httpOk({ error: { id: 911, message: 'No search result' } })))).toMatchObject({ ok: false, reason: 'empty' })
    expect(await agodaLiteAdapter.search(stay, deps(httpOk({ error: { id: 108, message: 'Site ID or API key is invalid' } })))).toMatchObject({ ok: false, reason: 'provider_error', detail: 'agoda_108' })
    expect(await agodaLiteAdapter.search(stay, deps(async () => ({ status: 401, json: {} })))).toMatchObject({ ok: false, reason: 'credentials_missing' })
    expect(await agodaLiteAdapter.search(stay, deps(httpOk({ nope: 1 })))).toMatchObject({ ok: false, reason: 'malformed' })
    expect(await agodaLiteAdapter.search(stay, deps(httpOk({ results: [{ hotelName: 'no id' }] })))).toMatchObject({ ok: false, reason: 'malformed' })
  })
  it('recheck asks the ONE hotel again: same rate ok, new rate price_changed, gone unavailable', async () => {
    const first = await agodaLiteAdapter.search(stay, deps(httpOk(RESULTS)))
    if (!first.ok) throw new Error('search failed')
    const item = first.value[0]
    const again = (rate: number | null) => httpOk(rate === null ? { error: { id: 911 } } : { results: [{ ...RESULTS.results[0], dailyRate: rate }] })
    expect(await agodaLiteAdapter.recheck!(item, stay, deps(again(850000)))).toMatchObject({ ok: true, value: { status: 'ok' } })
    expect(await agodaLiteAdapter.recheck!(item, stay, deps(again(990000)))).toMatchObject({ ok: true, value: { status: 'price_changed', previousPrice: 850000, currentPrice: 990000 } })
    expect(await agodaLiteAdapter.recheck!(item, stay, deps(again(null)))).toMatchObject({ ok: true, value: { status: 'unavailable' } })
  })
})

describe('Agoda Lite — switch, credentials and wiring', () => {
  it('OFF unless the flag is exactly "1"; BLOCKED without both credential names; READY with them', () => {
    expect(adapterState(agodaLiteAdapter, {}).state).toBe('OFF')
    expect(adapterState(agodaLiteAdapter, { ...ENV, CCP_REALTIME_AGODA_LITE: 'true' }).state).toBe('OFF')
    expect(adapterState(agodaLiteAdapter, { CCP_REALTIME_AGODA_LITE: '1', AGODA_LITE_SITE_ID: '111' })).toEqual({ state: 'BLOCKED_CREDENTIALS', missing: ['AGODA_LITE_API_KEY'] })
    expect(adapterState(agodaLiteAdapter, ENV).state).toBe('READY')
  })
  it('is one of the realtime adapters; with its flag OFF the resolver never calls it', async () => {
    expect(REALTIME_ADAPTERS).toContain(agodaLiteAdapter)
    const never: HttpPost = async () => { throw new Error('must not be called') }
    const off = await resolveBooking(stay, { env: {}, http: never, now: () => NOW, fallbackLinks: false, adapters: [agodaLiteAdapter] })
    expect(off.realtime).toEqual([])
    expect(off.statuses).toEqual([{ provider: 'agoda', state: 'OFF', missing: [], reason: 'off' }])
  })
  it('the resolver finds the city id from the destination name (verified table) and returns the live offers', async () => {
    const byName: SearchCriteria = { ...stay, context: { ...stay.context, providerRefs: undefined } }
    const on = await resolveBooking(byName, { env: ENV, http: httpOk(RESULTS), now: () => NOW, fallbackLinks: false, adapters: [agodaLiteAdapter] })
    expect(on.level).toBe('REALTIME_API')
    expect(on.realtime.map(r => r.providerItemId)).toEqual(['463019', '1144213'])
  })
  it('verified Agoda city ids (30/10, each from its own city page) — folded names, other spellings of the same city', () => {
    expect(verifiedRefsFor('Hội An')?.agoda?.cityRef).toBe('16552')
    expect(verifiedRefsFor('Đà Nẵng')?.agoda?.cityRef).toBe('16440')
    expect(verifiedRefsFor('Hà Nội')?.agoda?.cityRef).toBe('2758')
    expect(verifiedRefsFor('TP. Hồ Chí Minh')?.agoda?.cityRef).toBe('13170')
    expect(verifiedRefsFor('Sài Gòn')?.agoda?.cityRef).toBe('13170')
    expect(verifiedRefsFor('Phú Quốc')?.agoda?.cityRef).toBe('17188')
    expect(verifiedRefsFor('Đà Lạt')?.agoda?.cityRef).toBe('15932')
    expect(verifiedRefsFor('Quy Nhơn')).toBeUndefined() // no page found: no id is guessed
  })
})
