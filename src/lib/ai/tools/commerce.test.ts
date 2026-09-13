import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachCommerceLinks } from './commerce'
import { COMMERCE_LINKS_KEY, isCommerceLinkRow, setCommerceEventWriter, type CommerceLinkRow } from '@/lib/ccp'
import { splitToolResult } from '@/lib/ai/toolResultSplit'
import { productRecommendations, stayRecommendations, placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'

// ── Phase 6 seam: tool result → CCP → commerce_links → Action → live view ────
//
// Every case runs with `enabled: true` through the test seam; the product flag
// stays false. The search seam stands in for Serper and counts calls, because
// discovery is the only network this seam can cause.

const NOW = new Date('2026-09-13T08:00:00Z')

type SearchRow = { title: string; link: string; snippet: string }
function searchStub(table: Record<string, SearchRow[]>) {
  const calls: string[] = []
  const search = vi.fn(async (q: string) => {
    calls.push(q)
    const hit = Object.entries(table).find(([needle]) => q.includes(needle))
    return hit ? hit[1] : []
  })
  return { search, calls }
}

const links = (row: Record<string, unknown>) => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
/** A PasGo restaurant page that carries the reservation widget (Phase 8 read-only verification). */
const pasgoBookablePage = async () => '<input name="sfAdult"> var linkChuyenHuongBooking = "/dat-cho-ngay/1234?returnUrl=/nha-hang/x-1234";'
/** The page could not be read: bookability unknown → detail page only. */
const pageUnavailable = async () => null

beforeEach(() => { setCommerceEventWriter(() => undefined) })
afterEach(() => { setCommerceEventWriter(null) })

describe('attachCommerceLinks — gate and safety', () => {
  it('is an identity with CCP disabled (the production default) and performs no search', async () => {
    const { search, calls } = searchStub({})
    const result = { search_results: [{ title: 'Tủ lạnh', link: 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31' }] }
    const out = await attachCommerceLinks('search_products', result, { search, now: NOW })
    expect(out).toBe(result)
    expect(links(result.search_results[0])).toEqual([])
    expect(calls).toEqual([])
  })

  it('never throws on garbage and returns the input', async () => {
    for (const bad of [null, undefined, 42, 'x', [], { results: 'nope' }, { search_results: [null, 1, 'x'] }]) {
      await expect(attachCommerceLinks('search_places', bad, { enabled: true, search: async () => null })).resolves.toBe(bad)
    }
  })

  it('preserves row identity (the route keys shortlists and picks on it)', async () => {
    const row = { title: 'Tủ lạnh Samsung', link: 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31' }
    const result = { search_results: [row] }
    await attachCommerceLinks('search_products', result, { enabled: true, search: async () => [], now: NOW })
    expect(result.search_results[0]).toBe(row)
    expect(links(row).length).toBeGreaterThan(0)
  })
})

describe('DMX — shopping row with the merchant page already on it (L5 guest)', () => {
  it('attaches a verified product-page link, guest depth 5, no discovery call needed for the owned row', async () => {
    const { search, calls } = searchStub({})
    const row = { title: 'Tủ lạnh Samsung RT31', link: 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31', price_vnd: 8990000 }
    const result = { search_results: [row] }
    await attachCommerceLinks('search_products', result, { enabled: true, search, now: NOW })
    const [l] = links(row)
    expect(isCommerceLinkRow(l)).toBe(true)
    expect(l).toMatchObject({ providerId: 'dmx', intentType: 'buy_product', depth: 3, guestDepth: 5, authRequiredAt: 'at_order', domain: 'shopping' })
    expect(l.destinationUrl).toBe('https://www.dienmayxanh.com/tu-lanh/samsung-rt31')
    // DMX identity is 'near_realtime' in the registry (feed-backed ids); never 'realtime' — CCP holds no price here.
    expect(l.freshness.freshnessType).toBe('near_realtime')
    expect(l.freshness.retrievedAt).toBe(NOW.toISOString())
    // The row already carried a DMX URL → no query was spent looking for one.
    expect(calls).toEqual([])
  })

  it('feed display stays off: no price or feed field is projected onto the row (D7)', async () => {
    const row = { title: 'Tủ lạnh', link: 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31' }
    await attachCommerceLinks('search_products', { search_results: [row] }, { enabled: true, search: async () => [], now: NOW })
    const [l] = links(row)
    expect(Object.keys(l)).not.toContain('price')
    expect(JSON.stringify(l)).not.toMatch(/feed:/)
  })
})

describe('Trip.com — hotel rows discovered by a scoped search, dates preserved (param echo)', () => {
  const booking = () => ({ title: 'Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh-luxury-da-nang.vi.html', snippet: '' })

  it('builds the verified detail grammar with hotelId + checkIn/checkOut + adults, marking adults as assumed', async () => {
    const { search, calls } = searchStub({
      'site:vn.trip.com/hotels': [{ title: 'Mường Thanh Luxury Đà Nẵng', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-10569789/muong-thanh-luxury/', snippet: '' }],
    })
    const row = booking()
    const result = { search_results: [row], booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang' }
    await attachCommerceLinks('get_hotel_prices', result, { enabled: true, search, now: NOW, location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12' })
    expect(calls).toHaveLength(1)
    // Phase 8: the OTA title is reduced to the hotel name; the city is appended unquoted.
    expect(calls[0]).toContain('"Mường Thanh Luxury" Đà Nẵng')
    expect(calls[0]).toContain('site:vn.trip.com/hotels')
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'tripcom', intentType: 'book_hotel', depth: 4, guestDepth: 5, authRequiredAt: 'none', kind: 'DIRECT_DEEP_LINK' })
    const u = new URL(l.destinationUrl)
    expect(u.hostname).toBe('vn.trip.com')
    expect(u.pathname).toBe('/hotels/detail/')
    expect(u.searchParams.get('hotelId')).toBe('10569789')
    expect(u.searchParams.get('checkIn')).toBe('2026-10-10')
    expect(u.searchParams.get('checkOut')).toBe('2026-10-12')
    expect(u.searchParams.get('adult')).toBe('2')
    expect(l.assumedParams).toEqual(['adults'])
    // Session-bound: the stay expires at check-in.
    expect(l.expiresAt).toBe(new Date('2026-10-10T00:00:00+07:00').toISOString())
  })

  it('without dates lands on the detail page (L3, dates page-only) rather than inventing a stay', async () => {
    const { search } = searchStub({ 'site:vn.trip.com/hotels': [{ title: 'x', link: 'https://vn.trip.com/hotels/detail/?hotelId=10569789&cityId=42599', snippet: '' }] })
    const row = booking()
    await attachCommerceLinks('get_hotel_prices', { search_results: [row] }, { enabled: true, search, now: NOW, location: 'Đà Nẵng' })
    const [l] = links(row)
    expect(l.depth).toBe(3)
    expect(l.assumedParams).toEqual([])
    expect(new URL(l.destinationUrl).searchParams.has('checkIn')).toBe(false)
  })

  it('a look-alike host from the search is refused by the registry allow-list', async () => {
    const { search } = searchStub({ 'site:vn.trip.com/hotels': [{ title: 'x', link: 'https://vn.trip.com.attacker.example/hotels/detail/?hotelId=1', snippet: '' }] })
    const row = booking()
    await attachCommerceLinks('get_hotel_prices', { search_results: [row] }, { enabled: true, search, now: NOW })
    expect(links(row)).toEqual([])
  })
})

describe('PasGo — food place discovered by name (reservation)', () => {
  it('attaches the restaurant page (L3, guest L5 verified) when the conversation holds no date/time/party', async () => {
    const { search, calls } = searchStub({ 'site:pasgo.vn/nha-hang': [{ title: 'Nhà hàng Quá Ngon', link: 'https://pasgo.vn/nha-hang/nha-hang-qua-ngon-1234', snippet: '' }] })
    const row = { name: 'Quá Ngon', address: '1 Lê Lợi', website_uri: 'https://quangon.example' }
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, search, now: NOW, location: 'Quận 1', fetchText: pageUnavailable })
    expect(calls[0]).toContain('site:pasgo.vn/nha-hang')
    expect(calls[0]).toContain('Quận 1')
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'pasgo', intentType: 'reserve_table', depth: 3, guestDepth: 5, authRequiredAt: 'none' })
    expect(l.destinationUrl).toBe('https://pasgo.vn/nha-hang/nha-hang-qua-ngon-1234')
    expect(l.expiresAt).toBeNull()
  })
})

describe('CGV / Klook — the authentication boundary travels with the link', () => {
  it('CGV film page on a row resolves to L3 with authRequiredAt=before_selection; no seat/session URL is fabricated', async () => {
    const row = { name: 'CGV Vincom Đồng Khởi', website_uri: 'https://www.cgv.vn/default/inside-out-2.html' }
    const result = { results: [row], _tappy_place_domain: 'entertainment', source: 'Google Maps' }
    await attachCommerceLinks('search_places', result, { enabled: true, search: async () => [], now: NOW })
    const cgv = links(row).find(l => l.providerId === 'cgv')!
    expect(cgv).toMatchObject({ intentType: 'buy_ticket', depth: 3, guestDepth: 4, authRequiredAt: 'before_selection' })
    expect(cgv.destinationUrl).toBe('https://www.cgv.vn/default/inside-out-2.html')
    expect(cgv.destinationUrl).not.toMatch(/booking\/tickets/)
    expect(cgv.limitations.join(' ')).toMatch(/đăng nhập/)
  })

  it('Klook attraction discovered for an entertainment venue → L3, login before checkout', async () => {
    const { search } = searchStub({ 'site:klook.com/vi/activity': [{ title: 'Sun World Ba Na Hills', link: 'https://www.klook.com/vi/activity/2647-ba-na-hills-da-nang/', snippet: '' }] })
    const row = { name: 'Sun World Ba Na Hills' }
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'entertainment' }, { enabled: true, search, now: NOW })
    const klook = links(row).find(l => l.providerId === 'klook')!
    expect(klook).toMatchObject({ intentType: 'book_activity', depth: 3, guestDepth: 4, authRequiredAt: 'before_checkout' })
  })

  it('Klook spa voucher for a spa venue', async () => {
    const { search } = searchStub({ 'site:klook.com/vi/activity': [{ title: 'Ha Spa', link: 'https://www.klook.com/vi/activity/43345-ha-spa/', snippet: '' }] })
    const row = { name: 'Ha Spa' }
    await attachCommerceLinks('search_places', { results: [row], _tappy_place_domain: 'spa' }, { enabled: true, search, now: NOW })
    expect(links(row)[0]).toMatchObject({ providerId: 'klook', intentType: 'buy_spa_voucher', domain: 'spa', authRequiredAt: 'before_checkout' })
  })

  it('a generic place set (no stated domain) gets no commerce request at all', async () => {
    const { search, calls } = searchStub({})
    const row = { name: 'Somewhere' }
    await attachCommerceLinks('search_places', { results: [row] }, { enabled: true, search, now: NOW })
    expect(links(row)).toEqual([])
    expect(calls).toEqual([])
  })
})

describe('discovery budget and shortlist scope', () => {
  it('spends at most 3 searches per tool call and only on the shortlist', async () => {
    const { search, calls } = searchStub({})
    const rows = Array.from({ length: 8 }, (_, i) => ({ title: `Hotel ${i} - Đà Nẵng - Booking.com`, link: `https://www.booking.com/hotel/vn/h${i}.html` }))
    const result = { search_results: rows, _tappy_shortlist: [{ name: 'Hotel 5' }, { name: 'Hotel 2' }] }
    await attachCommerceLinks('get_hotel_prices', result, { enabled: true, search, now: NOW })
    expect(calls).toHaveLength(2)
    expect(calls.some(q => q.includes('"Hotel 5"'))).toBe(true)
    expect(calls.some(q => q.includes('"Hotel 2"'))).toBe(true)
    const many = { search_results: rows }
    calls.length = 0
    await attachCommerceLinks('get_hotel_prices', many, { enabled: true, search, now: NOW })
    expect(calls.length).toBeLessThanOrEqual(3)
  })
})

describe('end to end through the canonical recommendation architecture', () => {
  it('a commerce link becomes the FIRST action of the entity and reaches the web live view; the model sees only a capability', async () => {
    const row = { title: 'Tủ lạnh Samsung RT31', link: 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31', price_vnd: 8990000, source: 'Điện Máy Xanh' }
    const result: Record<string, unknown> = { search_results: [row], source: 'Google Shopping (Serper)' }
    await attachCommerceLinks('search_products', result, { enabled: true, search: async () => [], now: NOW })

    // 1. entity → actions: the commerce action leads, carries its facts, and the row's own link is not duplicated.
    const recs = productRecommendations(result)
    expect(recs).toHaveLength(1)
    const actions = recs[0].entity.actions
    expect(actions[0]).toMatchObject({ kind: 'purchase', urlKind: 'direct', platform: 'Điện Máy Xanh' })
    expect(actions[0].commerce).toMatchObject({ providerId: 'dmx', depth: 3, guestDepth: 5, loginRequired: false, freshnessType: 'near_realtime' })
    expect(actions.filter(a => a.url === row.link)).toHaveLength(1)

    // 2. Shopping renders its own card ([TAPPY_SHOPPING], a three-client marker) — the places
    //    live view stays null for a product lead exactly as before CCP. The commerce action is
    //    on the entity for cta.ts (flag-gated) and for the marker once that contract is extended.
    expect(buildPlacesLiveView(recs, {})).toBeNull()

    // 3. the model-facing split never sees the URL; it sees `has_direct_handoff`.
    const { model } = splitToolResult('search_products', result)
    const s = JSON.stringify(model)
    expect(s).not.toContain('commerce_links')
    expect(s).toContain('"has_direct_handoff":true')
  })

  it('hotel and place rows flow the same way (stay + place entities)', async () => {
    const { search } = searchStub({
      'site:vn.trip.com/hotels': [{ title: 'x', link: 'https://vn.trip.com/hotels/detail/?hotelId=10569789', snippet: '' }],
      'site:pasgo.vn/nha-hang': [{ title: 'x', link: 'https://pasgo.vn/nha-hang/qua-ngon-1234', snippet: '' }],
    })
    const hotel = { title: 'Mường Thanh - Đà Nẵng - Booking.com', link: 'https://www.booking.com/hotel/vn/muong-thanh.html' }
    const hotels = { search_results: [hotel], booking_link: 'https://www.booking.com/searchresults.html?ss=x' }
    await attachCommerceLinks('get_hotel_prices', hotels, { enabled: true, search, now: NOW, checkIn: '2026-10-10', checkOut: '2026-10-12' })
    const stay = stayRecommendations(hotels)[0]
    expect(stay.entity.actions[0]).toMatchObject({ kind: 'booking', urlKind: 'direct', platform: 'Trip.com' })
    // The live view (the enabled web channel) carries the commerce facts for the label + handoff beacon.
    const view = buildPlacesLiveView([stay], {})
    expect(view?.items[0].actions[0].commerce?.linkId).toBe(stay.entity.actions[0].commerce?.linkId)
    expect(view?.items[0].actions[0].platform).toBe("Trip.com")
    // The legacy Booking.com SEARCH link is still there, after the verified one.
    expect(stay.entity.actions.some(a => a.kind === 'booking' && a.urlKind === 'search')).toBe(true)

    const place = { name: 'Quá Ngon', address: '1 Lê Lợi', maps_link: 'https://maps.google.com/?cid=1' }
    const places = { results: [place], _tappy_place_domain: 'food', source: 'Google Maps' }
    // Owner correction: a reservation leads only when the user asked for one (capability routing).
    await attachCommerceLinks('search_places', places, { enabled: true, search, now: NOW, userText: 'đặt bàn nhà hàng này', fetchText: pasgoBookablePage })
    const rec = placeRecommendations(places, 'Quận 1')[0]
    expect(rec.entity.actions[0]).toMatchObject({ kind: 'reservation', urlKind: 'direct', platform: 'PasGo' })
  })
})

describe('idempotence on a memoised tool result', () => {
  it('re-attaching replaces last turn\'s links instead of stacking them', async () => {
    const row = { title: 'Tủ lạnh', link: 'https://www.dienmayxanh.com/tu-lanh/samsung-rt31' }
    const result = { search_results: [row] }
    await attachCommerceLinks('search_products', result, { enabled: true, search: async () => [], now: NOW })
    await attachCommerceLinks('search_products', result, { enabled: true, search: async () => [], now: NOW })
    expect(links(row)).toHaveLength(1)
  })
})
