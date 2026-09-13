import { describe, it, expect, vi } from 'vitest'
import { attachCommerceLinks } from './commerce'
import { verifyMerchantPage, discoverBySubject } from './commerceDiscovery'
import { foodCapabilityOf, parseReservationSpec } from './commerceIntent'
import { COMMERCE_LINKS_KEY, resolveCommerce, type CommerceLinkRow } from '@/lib/ccp'
import { adaptersFor } from '@/lib/ccp/adapters'
import { buildActions } from '@/lib/recommendation/actions'
import { placeRecommendations, productRecommendations, stayRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'
import { resolveActionLabel } from '@/lib/recommendation/actionLabel'
import { isMisleadingModelCta, validateModelCtaButtons } from '@/lib/recommendation/ctaValidation'
import { buildShoppingSynthesis } from '@/lib/ai/consultative/synthesis'
import { buildSynthesisView, parseShoppingMarker, renderShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import { cleanOtaTitle, otaCityKeyOf, stripTrailingCity } from '@/lib/links/otaTitle'
import type { Candidate } from '@/lib/ai/consultative/candidate'

// ── CCP Phase 8 — the mandatory regression tests (owner message §10, A–I) ────
//
// Each block is named for the finding it closes in "Owner-Like UAT Round 1".
// Everything runs offline: search and merchant-page reads go through the seams.

const NOW = new Date('2026-09-13T08:00:00Z')
const links = (row: Record<string, unknown>) => (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[] | undefined) ?? []
const t = (key: string, vars?: Record<string, string>) => vars ? `${key}:${vars.platform}` : key

/** A PasGo restaurant page that carries the reservation widget (read-only verification, 13 Sep 2026). */
const PASGO_BOOKABLE = '<html><input name="sfAdult"><script>var linkChuyenHuongBooking = "https://pasgo.vn/dat-cho-ngay/3875?returnUrl=/nha-hang/rakuen-hotpot-le-van-sy-3875";</script></html>'
/** A venue that left the programme (Jaspas 1257/1255, seen live). */
const PASGO_STOPPED = '<html><p>Nhà hàng đã dừng đặt chỗ trên hệ thống PasGo</p></html>'
/** A venue PasGo lists but does not serve (Saigon Fusion 2098, seen live). */
const PASGO_UNSUPPORTED = '<html><input name="sfAdult"><div>Chưa hỗ trợ đặt bàn qua PasGo</div></html>'

function stub(table: Record<string, Array<{ title: string; link: string; snippet: string }>>) {
  const calls: string[] = []
  const search = vi.fn(async (q: string) => {
    calls.push(q)
    const hit = Object.entries(table).find(([needle]) => q.includes(needle))
    return hit ? hit[1] : []
  })
  return { search, calls }
}
const pasgoHit = { 'site:pasgo.vn/nha-hang': [{ title: 'Rakuen Hotpot', link: 'https://pasgo.vn/nha-hang/rakuen-hotpot-le-van-sy-3875', snippet: '' }] }

// ── A · food_delivery can never select PasGo ─────────────────────────────────
describe('A · food_delivery → PasGo is impossible', () => {
  it('the adapter set for a delivery request contains no PasGo, at every layer', () => {
    const req = { domain: 'food_drink', intentType: 'order_delivery', capability: 'food_delivery', subject: 'Phở Hòa' } as const
    expect(adaptersFor(req).map(a => a.providerId)).not.toContain('pasgo')
    const out = resolveCommerce(req, { enabled: true, now: NOW, hints: [{ url: 'https://pasgo.vn/nha-hang/pho-hoa-999', verified: { bookable: true, checkedAt: NOW.toISOString(), source: 'merchant_page' } }] })
    expect('links' in out ? out.links : []).toEqual([])
    expect('providersQueried' in out ? out.providersQueried : []).not.toContain('pasgo')
  })

  it('the seam, on a delivery sentence, attaches no PasGo link even when the row itself points at pasgo.vn', async () => {
    const row = { name: 'Phở Hòa', address: '260C Pasteur', website_uri: 'https://pasgo.vn/nha-hang/pho-hoa-999', maps_link: 'https://maps.google.com/?cid=1' }
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const { search, calls } = stub({ ...pasgoHit })
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, fetchText: async () => PASGO_BOOKABLE, userTexts: ['Tôi muốn đặt đồ ăn giao tận nhà.', 'Phở ở Quận 3'] })
    expect(links(row).map(l => l.providerId)).not.toContain('pasgo')
    expect(calls.some(q => q.includes('pasgo'))).toBe(false)
  })

  it('a delivery sentence discovers the delivery platform RESTAURANT page (passthrough, L3, app boundary stated)', async () => {
    const row = { name: 'Phở 24 Nguyễn Tri Phương', address: 'Quận 10', maps_link: 'https://maps.google.com/?cid=1' }
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const { search } = stub({
      'site:shopeefood.vn': [{ title: 'Phở 24 - Nguyễn Tri Phương - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/pho-24-nguyen-tri-phuong', snippet: '' }],
      'site:food.grab.com/vn': [{ title: 'Phở 24 - GrabFood', link: 'https://food.grab.com/vn/vi/restaurant/pho-24-nguyen-tri-phuong-delivery/5-C2ABC', snippet: '' }],
    })
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, userTexts: ['Tôi muốn đặt đồ ăn giao tận nhà.'] })
    const ls = links(row)
    expect(ls.length).toBeGreaterThan(0)
    for (const l of ls) {
      expect(['shopeefood', 'grabfood']).toContain(l.providerId)
      expect(l).toMatchObject({ capability: 'food_delivery', primary: true, depth: 3, kind: 'DETAIL_HANDOFF' })
      // The page the user opens is the restaurant page found, not a search URL that drops the query.
      expect(new URL(l.destinationUrl).search).toBe('')
    }
    const shopee = ls.find(l => l.providerId === 'shopeefood')!
    expect(shopee.destinationUrl).toBe('https://shopeefood.vn/ho-chi-minh/pho-24-nguyen-tri-phuong')
    expect(shopee.authRequiredAt).toBe('app_only')
    // …and the label says so before the tap.
    const rec = placeRecommendations(result, 'Quận 10')[0]
    const lead = rec.entity.actions[0]
    expect(lead.commerce?.providerId).toBe(ls[0].providerId)
    expect(resolveActionLabel(lead).key).toMatch(/AppOn$|LoginOn$/)
  })

  it('a ShopeeFood SEARCH url is never accepted as a handoff', async () => {
    const row = { name: 'Phở Hòa', maps_link: 'https://maps.google.com/?cid=1' }
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const { search } = stub({ 'site:shopeefood.vn': [{ title: 'x', link: 'https://shopeefood.vn/tim-kiem?q=Ph%E1%BB%9F%20H%C3%B2a', snippet: '' }] })
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, userTexts: ['giao tận nhà'] })
    expect(links(row)).toEqual([])
  })
})

// ── B · reservation configuration survives a clarification turn ──────────────
describe('B · party / time / date survive the clarifying turn', () => {
  const turns = ['Tìm nhà hàng phù hợp và đặt bàn cho 2 người lúc 19:00 tối nay.', 'Nhà hàng Nhật ở Quận 3']
  it('the capability and the spec are read across the last three user turns, newest first', () => {
    expect(foodCapabilityOf(turns)).toBe('table_reservation')
    expect(parseReservationSpec(turns, NOW)).toEqual({ adults: 2, time: '19:00', date: '2026-09-13', assumed: [] })
    // The reply alone carries none of it — that is exactly why the window exists.
    expect(foodCapabilityOf(turns[1])).toBe('restaurant_discovery')
    expect(parseReservationSpec(turns[1], NOW)).toBeNull()
  })

  it('the seam emits the PRIMARY hold link with the party/time/date from two turns ago', async () => {
    const row = { name: 'Rakuen Hotpot', address: 'Lê Văn Sỹ', maps_link: 'https://maps.google.com/?cid=1' }
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const { search } = stub(pasgoHit)
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, fetchText: async () => PASGO_BOOKABLE, location: 'Quận 3', userText: turns[1], userTexts: turns })
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'pasgo', capability: 'table_reservation', primary: true, depth: 5 })
    const u = new URL(l.destinationUrl)
    expect(u.pathname).toBe('/dat-cho-ngay/3875')
    expect(Object.fromEntries(u.searchParams)).toEqual({ returnUrl: '/nha-hang/rakuen-hotpot-le-van-sy-3875', sfAdult: '2', sfChild: '0', sfDateFrom: '13/09/2026', sfTimeFrom: '19:00' })
    expect(l.assumedParams).toEqual([])
  })

  it('a newer delivery sentence overrides an older reservation one (newest signal wins)', () => {
    expect(foodCapabilityOf(['đặt bàn cho 2 người lúc 19h', 'thôi, giao tận nhà đi'])).toBe('food_delivery')
  })
})

// ── C · PasGo: the current valid grammar, or a truthful unavailable state ─────
describe('C · PasGo — verified grammar or truthful unavailability', () => {
  const rowResult = () => {
    const row = { name: 'Rakuen Hotpot', maps_link: 'https://maps.google.com/?cid=1' }
    return { row, result: { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' } }
  }
  const ask = (result: unknown, fetchText: () => Promise<string | null>, text = 'Đặt bàn cho 2 người lúc 19h tối nay') =>
    attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search: stub(pasgoHit).search, fetchText, userTexts: [text] })

  it('the verifier reads the registry signals: widget + redirect → bookable; refusal text → not bookable; no page → unknown', async () => {
    const url = 'https://pasgo.vn/nha-hang/rakuen-hotpot-le-van-sy-3875'
    expect((await verifyMerchantPage(url, { fetchText: async () => PASGO_BOOKABLE, now: NOW })).bookable).toBe(true)
    expect((await verifyMerchantPage(url, { fetchText: async () => PASGO_STOPPED, now: NOW })).bookable).toBe(false)
    expect((await verifyMerchantPage(url, { fetchText: async () => PASGO_UNSUPPORTED, now: NOW })).bookable).toBe(false)
    expect((await verifyMerchantPage(url, { fetchText: async () => null, now: NOW })).bookable).toBeNull()
    // A URL the registry does not own is never fetched.
    const fetchText = vi.fn(async () => PASGO_BOOKABLE)
    expect((await verifyMerchantPage('https://evil.example/nha-hang/x-1', { fetchText, now: NOW })).bookable).toBeNull()
    expect(fetchText).not.toHaveBeenCalled()
  })

  it('bookable + full configuration → the hold URL carries returnUrl (the restaurant page path) and the sf params', async () => {
    const { row, result } = rowResult()
    await ask(result, async () => PASGO_BOOKABLE)
    const [l] = links(row)
    expect(l.destinationUrl).toBe('https://pasgo.vn/dat-cho-ngay/3875?returnUrl=%2Fnha-hang%2Frakuen-hotpot-le-van-sy-3875&sfAdult=2&sfChild=0&sfDateFrom=13%2F09%2F2026&sfTimeFrom=19%3A00')
    expect(l.expiresAt).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString())
  })

  it('a venue that left the programme gets NO link — nothing is fabricated', async () => {
    const { row, result } = rowResult()
    await ask(result, async () => PASGO_STOPPED)
    expect(links(row)).toEqual([])
    const { row: row2, result: result2 } = rowResult()
    await ask(result2, async () => PASGO_UNSUPPORTED)
    expect(links(row2)).toEqual([])
  })

  it('a page that could not be read → the restaurant page (L3) with the limitation stated, never the hold grammar', async () => {
    const { row, result } = rowResult()
    await ask(result, async () => null)
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'pasgo', depth: 3, primary: true })
    expect(l.destinationUrl).toBe('https://pasgo.vn/nha-hang/rakuen-hotpot-le-van-sy-3875')
    expect(l.limitations.join(' ')).toMatch(/Chưa xác minh/)
  })

  it('no date in the conversation → the restaurant page (L3), even when the venue is bookable: a date is never assumed', async () => {
    const { row, result } = rowResult()
    await ask(result, async () => PASGO_BOOKABLE, 'Đặt bàn cho 2 người lúc 19h')
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'pasgo', depth: 3, primary: true })
    expect(l.destinationUrl).not.toContain('dat-cho-ngay')
  })

  it('at most three merchant pages are read per turn', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ name: `Quán ${i}`, maps_link: `https://maps.google.com/?cid=${i}` }))
    const result = { results: rows, _tappy_place_domain: 'food', source: 'Google Maps' }
    const fetchText = vi.fn(async () => PASGO_BOOKABLE)
    const search = async () => [{ title: 'x', link: 'https://pasgo.vn/nha-hang/quan-1234', snippet: '' }]
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, fetchText, maxRows: 5, userTexts: ['đặt bàn 2 người 19h tối nay'] })
    expect(fetchText.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

// ── D · the DMX Commerce Link reaches the canonical Shopping action ───────────
describe('D · DMX CommerceLink → canonical Shopping Action → Shopping presentation', () => {
  const dmxRow = () => ({ title: 'iPhone 15 128GB', link: 'https://www.dienmayxanh.com/dien-thoai/iphone-15-128gb', price_vnd: 19990000, source: 'Điện Máy Xanh' })
  const googleRow = () => ({ title: 'iPhone 15 128GB - Shopee', link: 'https://www.google.com/search?q=iphone+15&prds=1', price_vnd: 18990000, source: 'Shopee' })

  it('the canonical Action for the row is the DMX handoff, first, with its facts', async () => {
    const row = dmxRow()
    const result = { search_results: [row, googleRow()], source: 'Google Shopping (Serper)' }
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, search: async () => [] })
    const [l] = links(row)
    expect(l).toMatchObject({ providerId: 'dmx', capability: 'product_purchase', primary: true })
    const rec = productRecommendations(result)[0]
    expect(rec.entity.actions[0]).toMatchObject({ kind: 'purchase', urlKind: 'direct', platform: 'Điện Máy Xanh' })
    expect(rec.entity.actions[0].commerce?.linkId).toBe(l.linkId)
  })

  it('the Shopping marker carries the same link as `commerce`, and it survives the text round-trip', async () => {
    const row = dmxRow()
    const google = googleRow()
    const result = { search_results: [row, google], source: 'Google Shopping (Serper)' }
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, search: async () => [] })
    const candidates: Candidate[] = [row, google].map((r, i) => ({ id: `c${i}`, name: r.title, raw: r } as unknown as Candidate))
    const synthesis = buildShoppingSynthesis(candidates, null, 'Tìm cho tôi iPhone phù hợp để mua.')
    const view = buildSynthesisView(synthesis)
    const withCommerce = view.entities.filter(e => e.commerce)
    expect(withCommerce.length).toBeGreaterThanOrEqual(1)
    const c = withCommerce[0].commerce!
    expect(c).toMatchObject({ providerId: 'dmx', merchantName: 'Điện Máy Xanh', primary: true, linkId: links(row)[0].linkId })
    expect(new URL(c.url).hostname).toMatch(/dienmayxanh\.com$/)
    // The marker is text; the projection must come back intact.
    const back = parseShoppingMarker(`Đây là gợi ý.\n${renderShoppingMarker(view)}`)
    expect(back.view?.entities.find(e => e.commerce)?.commerce).toEqual(c)
    // …and the label promise is the merchant's, not Google's.
    expect(resolveActionLabel({ kind: 'purchase', urlKind: 'direct', url: c.url, platform: c.merchantName, commerce: c })).toEqual({ key: 'v3.action.purchaseOn', params: { platform: 'Điện Máy Xanh' } })
  })

  it('an entity with no Commerce Link keeps the fallback (no `commerce`), so Google Shopping rows still render their own honest offer', async () => {
    const google = googleRow()
    const result = { search_results: [google], source: 'Google Shopping (Serper)' }
    await attachCommerceLinks('search_products', result, { enabled: true, now: NOW, search: async () => [] })
    const view = buildSynthesisView(buildShoppingSynthesis([{ id: 'c0', name: google.title, raw: google } as unknown as Candidate], null, 'iPhone'))
    expect(view.entities[0].commerce).toBeUndefined()
    expect(view.entities[0].offers[0].url).toBe(google.link)
  })
})

// ── E · an activity request cannot emit the Booking.com fallback CTA ─────────
describe('E · activity_booking: Klook, never a hotel-OTA ticket CTA', () => {
  it('the model-authored "🎫 Tìm vé trên Booking.com / Agoda" button is dropped, not relabelled', () => {
    const buttons = [
      { label: '🎫 Tìm vé trên Booking.com', type: 'ticket', url: 'https://www.booking.com/searchresults.html?ss=Ba+Na+Hills' },
      { label: '🎫 Mua vé trên Agoda', type: 'ticket', url: 'https://www.agoda.com/search?city=16440' },
      { label: '📍 Google Maps', type: 'maps', url: 'https://maps.google.com/?q=Ba+Na+Hills' },
    ]
    expect(isMisleadingModelCta(buttons[0])).toBe(true)
    expect(isMisleadingModelCta(buttons[1])).toBe(true)
    expect(validateModelCtaButtons(buttons, t).map(b => b.url)).toEqual([buttons[2].url])
    // A hotel search on Booking.com on a HOTEL turn is still an honest "find rooms" button.
    expect(isMisleadingModelCta({ label: '🏨 Đặt phòng trên Booking.com', type: 'booking', url: 'https://www.booking.com/searchresults.html?ss=Da+Nang' })).toBe(false)
  })

  it('the seam discovers Klook by SUBJECT + city and attaches it as its own row — not as a link on an unrelated venue', async () => {
    const bar = { name: 'Pont main', address: 'Đà Nẵng', maps_link: 'https://maps.google.com/?cid=1', website_uri: 'https://pontmain.example' }
    const result = { results: [bar], _tappy_place_domain: 'entertainment', source: 'OSM', query: 'hoạt động vui chơi' }
    const { search, calls } = stub({
      'hoạt động vui chơi Đà Nẵng site:klook.com/vi/activity': [
        { title: 'Vé Sun World Ba Na Hills - Klook Việt Nam', link: 'https://www.klook.com/vi/activity/1337-ba-na-hills-da-nang/', snippet: '' },
      ],
    })
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, location: 'Đà Nẵng', query: 'hoạt động vui chơi', userTexts: ['Tìm hoạt động vui chơi cho tôi.', 'Đà Nẵng'] })
    expect(links(bar).map(l => l.providerId)).not.toContain('klook')
    const rows = result.results as Array<Record<string, unknown>>
    const experience = rows.find(r => r._tappy_experience === true)!
    expect(experience).toBeDefined()
    expect(experience.name).toBe('Vé Sun World Ba Na Hills')
    const [l] = links(experience)
    expect(l).toMatchObject({ providerId: 'klook', capability: 'activity_booking', primary: true, depth: 3, guestDepth: 4, authRequiredAt: 'before_checkout' })
    const rec = placeRecommendations(result, 'Đà Nẵng').find(r => r.entity.identity.name === 'Vé Sun World Ba Na Hills')!
    expect(rec.entity.actions[0].commerce).toMatchObject({ providerId: 'klook', loginRequired: true })
    expect(calls.some(q => q.includes('Pont main') && q.includes('klook'))).toBe(true) // venue-name discovery ran…
    expect(calls.some(q => q.startsWith('hoạt động vui chơi Đà Nẵng'))).toBe(true) // …and subject discovery followed
  })

  it('no film tool: a cinema sentence keeps CGV primary and does not run subject discovery', async () => {
    const row = { name: 'CGV Vincom Đồng Khởi', website_uri: 'https://www.cgv.vn/default/inside-out-2.html' }
    const result = { results: [row], _tappy_place_domain: 'entertainment', query: 'suất chiếu CGV' }
    const { search, calls } = stub({})
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, query: 'suất chiếu CGV', userTexts: ['Tìm suất chiếu CGV tối nay.'] })
    expect(links(row).find(l => l.providerId === 'cgv')).toMatchObject({ primary: true, depth: 3 })
    expect((result.results as unknown[]).length).toBe(1)
    expect(calls.some(q => q.startsWith('suất chiếu CGV'))).toBe(false)
  })
})

// ── F · travel discovery: city, identity, availability, params ───────────────
describe('F · hotel discovery — wrong city rejected, unavailable rejected, normalised title accepted, params preserved', () => {
  it('OTA titles reduce to the hotel name; OTA URLs reveal their city', () => {
    expect(cleanOtaTitle('Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com')).toBe('Oc Tien Sa Hotel Danang')
    expect(stripTrailingCity(cleanOtaTitle('Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com'))).toBe('Oc Tien Sa Hotel')
    expect(cleanOtaTitle('Dai Long Hotel | Hoi An 2026 UPDATED DEALS, HD Photos & Reviews')).toBe('Dai Long Hotel')
    expect(cleanOtaTitle('Mường Thanh Luxury Đà Nẵng - Đà Nẵng - Booking.com')).toBe('Mường Thanh Luxury Đà Nẵng')
    expect(otaCityKeyOf('https://www.agoda.com/vi-vn/dai-long-hotel/hotel/hoi-an-vn.html')).toBe('hoi-an')
    expect(otaCityKeyOf('https://vn.trip.com/hotels/da-nang-hotel-detail-707332/oc-tien-sa-hotel/')).toBe('da-nang')
    expect(otaCityKeyOf('https://www.booking.com/hotel/vn/dai-long.html')).toBeNull()
  })

  it('a wrong-city OTA row leaves the result; a Trip.com hit in another city is refused; the right one is accepted with the params', async () => {
    const ocTienSa = { title: 'Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com', link: 'https://www.agoda.com/vi-vn/oc-tien-sa-hotel/hotel/da-nang-vn.html', snippet: '' }
    const daiLong = { title: 'Dai Long Hotel | Hoi An 2026 UPDATED DEALS, HD Photos & Reviews', link: 'https://www.agoda.com/vi-vn/dai-long-hotel/hotel/hoi-an-vn.html', snippet: '' }
    const result: Record<string, unknown> = { search_results: [ocTienSa, daiLong], booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang' }
    const { search, calls } = stub({
      '"Oc Tien Sa Hotel" Đà Nẵng site:vn.trip.com/hotels': [
        { title: 'Oc Tien Sa Hotel', link: 'https://vn.trip.com/hotels/hoi-an-hotel-detail-999/oc-tien-sa-hotel/', snippet: '' }, // wrong city → refused
        { title: 'Ốc Tiên Sa Đà Nẵng', link: 'https://vn.trip.com/hotels/da-nang-hotel-detail-707332/oc-tien-sa-hotel/', snippet: '' },
      ],
    })
    await attachCommerceLinks('get_hotel_prices', result, { enabled: true, now: NOW, search, location: 'Đà Nẵng', checkIn: '2026-10-10', checkOut: '2026-10-12', userTexts: ['Tìm khách sạn ở Đà Nẵng cho 2 người, check-in 10/10/2026, check-out 12/10/2026.'] })
    // P2-8: Đại Long (Hội An) is not a Đà Nẵng result.
    expect(result.search_results).toEqual([ocTienSa])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('"Oc Tien Sa Hotel" Đà Nẵng')
    const [l] = links(ocTienSa as unknown as Record<string, unknown>)
    expect(l).toMatchObject({ providerId: 'tripcom', depth: 4, guestDepth: 5, authRequiredAt: 'none', kind: 'DIRECT_DEEP_LINK' })
    const u = new URL(l.destinationUrl)
    expect(u.pathname).toBe('/hotels/detail/')
    expect(u.searchParams.get('hotelId')).toBe('707332')
    expect(u.searchParams.get('checkIn')).toBe('2026-10-10')
    expect(u.searchParams.get('checkOut')).toBe('2026-10-12')
    expect(u.searchParams.get('adult')).toBe('2')
    expect(l.assumedParams).toEqual(['adults'])
    // Presentation: the stay's name is the hotel's, not the OTA marketing string.
    const stay = stayRecommendations(result)[0]
    expect(stay.entity.identity.name).toBe('Oc Tien Sa Hotel Danang')
  })

  it('a property the merchant marks unavailable is not offered (verified hint → no Trip.com offer)', () => {
    const req = { domain: 'travel', intentType: 'book_hotel', capability: 'hotel_booking', subject: 'Oc Tien Sa Hotel', configuration: { kind: 'hotel', propertyRef: 'oc-tien-sa', checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2 } } as const
    const hint = { url: 'https://vn.trip.com/hotels/da-nang-hotel-detail-707332/oc-tien-sa-hotel/' }
    const ok = resolveCommerce(req, { enabled: true, now: NOW, hints: [hint] })
    expect('links' in ok && ok.links.length).toBe(1)
    const no = resolveCommerce(req, { enabled: true, now: NOW, hints: [{ ...hint, verified: { bookable: false, checkedAt: NOW.toISOString(), source: 'merchant_page' } }] })
    expect('links' in no ? no.links : []).toEqual([])
  })
})

// ── G · spa + city discovers a Klook package ─────────────────────────────────
describe('G · spa + city → Klook Spa package (L4 guest, login before checkout)', () => {
  it('discovery is phrased from the subject and the city, unquoted, on the Klook scope', async () => {
    const search = vi.fn(async () => [{ title: 'Ha Spa & Massage tại Hồ Chí Minh - Klook', link: 'https://www.klook.com/vi/activity/43345-ha-spa-massage-ho-chi-minh/', snippet: '' }])
    const hits = await discoverBySubject('spa', 'buy_spa_voucher', 'spa', 'TP.HCM', { search })
    expect(search).toHaveBeenCalledWith('spa TP.HCM site:klook.com/vi/activity')
    expect(hits).toEqual([{ subjectId: 'subject', providerId: 'klook', url: 'https://www.klook.com/vi/activity/43345-ha-spa-massage-ho-chi-minh/', title: 'Ha Spa & Massage tại Hồ Chí Minh - Klook' }])
  })

  it('the seam attaches the package as its own row with the Klook facts; venue rows without a listing take no link', async () => {
    const venue = { name: 'Tiệm Massage Hán Cung', address: 'Quận 1', maps_link: 'https://maps.google.com/?cid=1' }
    const result = { results: [venue], _tappy_place_domain: 'spa', source: 'Google Maps' }
    const { search } = stub({
      'spa TP.HCM site:klook.com/vi/activity': [{ title: 'Ha Spa & Massage tại Hồ Chí Minh - Klook', link: 'https://www.klook.com/vi/activity/43345-ha-spa-massage-ho-chi-minh/', snippet: '' }],
    })
    await attachCommerceLinks('search_places', result, { enabled: true, now: NOW, search, location: 'TP.HCM', query: 'spa', userTexts: ['Tìm spa ở TP.HCM.'] })
    expect(links(venue)).toEqual([])
    const pkg = (result.results as Array<Record<string, unknown>>).find(r => r._tappy_experience === true)!
    expect(pkg.name).toBe('Ha Spa & Massage tại Hồ Chí Minh')
    const [l] = links(pkg)
    expect(l).toMatchObject({ providerId: 'klook', capability: 'spa_voucher', primary: true, depth: 3, guestDepth: 4, authRequiredAt: 'before_checkout' })
    expect(l.destinationUrl).toBe('https://www.klook.com/vi/activity/43345-ha-spa-massage-ho-chi-minh/')
    const view = buildPlacesLiveView(placeRecommendations(result, 'TP.HCM'), {})!
    const item = view.items.find(i => i.name === 'Ha Spa & Massage tại Hồ Chí Minh')!
    expect(item.actions[0].commerce).toMatchObject({ providerId: 'klook', loginRequired: true, primary: true })
  })
})

// ── H · duplicate action prevention ──────────────────────────────────────────
describe('H · one handoff per provider per row, on every turn', () => {
  it('two PasGo hits for one venue → one PasGo link; a second turn on the cached result does not stack', async () => {
    const row = { name: 'Rakuen Hotpot', website_uri: 'https://pasgo.vn/nha-hang/rakuen-hotpot-le-van-sy-3875', maps_link: 'https://maps.google.com/?cid=1' }
    const result = { results: [row], _tappy_place_domain: 'food', source: 'Google Maps' }
    const search = async () => [
      { title: 'Rakuen Hotpot', link: 'https://pasgo.vn/nha-hang/rakuen-hotpot-le-van-sy-3875', snippet: '' },
      { title: 'Rakuen Hotpot (2)', link: 'https://pasgo.vn/nha-hang/rakuen-hotpot-3875', snippet: '' },
    ]
    const ctx = { enabled: true, now: NOW, search, fetchText: async () => PASGO_BOOKABLE, userTexts: ['đặt bàn 2 người 19h tối nay'] }
    await attachCommerceLinks('search_places', result, ctx)
    expect(links(row).filter(l => l.providerId === 'pasgo')).toHaveLength(1)
    await attachCommerceLinks('search_places', result, ctx)
    expect(links(row).filter(l => l.providerId === 'pasgo')).toHaveLength(1)
    // The canonical action list shows exactly one reservation action for the row.
    const actions = buildActions(row as never, 'food', 'Quận 3')
    expect(actions.filter(a => a.kind === 'reservation')).toHaveLength(1)
    expect(actions[0].commerce?.providerId).toBe('pasgo')
  })

  it('synthetic listing rows from a previous turn are replaced, not accumulated', async () => {
    const venue = { name: 'Spa A', maps_link: 'https://maps.google.com/?cid=1' }
    const result = { results: [venue], _tappy_place_domain: 'spa', source: 'Google Maps' }
    const { search } = stub({ 'spa TP.HCM site:klook.com/vi/activity': [{ title: 'Ha Spa - Klook', link: 'https://www.klook.com/vi/activity/43345-ha-spa/', snippet: '' }] })
    const ctx = { enabled: true, now: NOW, search, location: 'TP.HCM', query: 'spa', userTexts: ['Tìm spa ở TP.HCM.'] }
    await attachCommerceLinks('search_places', result, ctx)
    await attachCommerceLinks('search_places', result, ctx)
    const rows = result.results as Array<Record<string, unknown>>
    expect(rows.filter(r => r._tappy_experience === true)).toHaveLength(1)
    expect(rows[0]).toBe(venue)
  })
})

// ── I · misleading CTA prevention ────────────────────────────────────────────
describe('I · no misleading CTA reaches the user', () => {
  it('a model-typed front door on a CCP merchant host is dropped; a direct entity page on that host is kept', () => {
    const home = { label: '🎬 Xem lịch chiếu CGV', type: 'ticket', url: 'https://www.cgv.vn/' }
    const page = { label: '🎬 CGV Vincom Đồng Khởi', type: 'website', url: 'https://www.cgv.vn/default/cinox/site/cgv-vincom-dong-khoi/' }
    const pasgoSearch = { label: '🍽️ Đặt bàn trên PasGo', type: 'reservation', url: 'https://pasgo.vn/tim-kiem?q=nha+hang+nhat' }
    expect(isMisleadingModelCta(home)).toBe(true)
    expect(isMisleadingModelCta(pasgoSearch)).toBe(true)
    expect(isMisleadingModelCta(page)).toBe(false)
    expect(validateModelCtaButtons([home, page, pasgoSearch], t).map(b => b.url)).toEqual([page.url])
  })

  it('an over-promising label on a search URL is still only downgraded (unchanged behaviour)', () => {
    const [b] = validateModelCtaButtons([{ label: '🎫 Mua vé', type: 'ticket', url: 'https://ticketbox.vn/' }], t)
    expect(b.type).toBe('search')
    expect(b.label).toBe('v3.action.ticketSearch:Ticketbox')
  })

  it('a commerce action whose merchant orders only in its app says so; one that needs a login says so; a guest one does not', () => {
    const base = { kind: 'order' as const, urlKind: 'direct' as const, url: 'https://shopeefood.vn/ho-chi-minh/pho-24', platform: 'ShopeeFood' }
    const facts = { linkId: 'l', requestId: 'r', providerId: 'shopeefood', depth: 3, guestDepth: 3, freshnessType: 'realtime' as const, expiresAt: null, tracked: false, primary: true }
    expect(resolveActionLabel({ ...base, commerce: { ...facts, authRequiredAt: 'app_only', loginRequired: false } }).key).toBe('v3.action.orderAppOn')
    expect(resolveActionLabel({ ...base, kind: 'ticket', commerce: { ...facts, authRequiredAt: 'before_selection', loginRequired: true } }).key).toBe('v3.action.ticketLoginOn')
    expect(resolveActionLabel({ ...base, kind: 'reservation', commerce: { ...facts, authRequiredAt: 'none', loginRequired: false } }).key).toBe('v3.action.reservationOn')
  })
})
