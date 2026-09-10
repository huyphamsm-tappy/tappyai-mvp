import { describe, it, expect } from 'vitest'
import { placeRecommendations, stayRecommendations, productRecommendations } from './fromToolResult'
import { buildPlacesLiveView } from './liveView'

// ─────────────────────────────────────────────────────────────────────────────
// One decision channel, five domains, and the places it must stay silent.
//
// The audit's finding was that a place turn computes a full decision and then
// renders none of it. These tests run the REAL adapter over REAL tool-result
// shapes — the ones `searchPlaces` and `getHotelPrices` actually emit — and
// assert what a user would end up seeing.
//
// The negative cases matter at least as much: flights and intercity transport
// have no deterministic ranking, and a turn where the engine did not choose must
// produce NO card rather than a Pick invented for visual symmetry.
// ─────────────────────────────────────────────────────────────────────────────

const placeRow = (name: string, over: Record<string, unknown> = {}) => ({
  place_id: `g-${name}`,
  name,
  address: `12 ${name} Street, Hoàn Kiếm`,
  rating_value: 4.7,
  rating_count: 210,
  opening_hours: '08:00–22:30',
  open_now: true,
  price_level: 2,
  maps_link: `https://www.google.com/maps/place/?q=place_id:g-${name}`,
  website_uri: `https://${name.toLowerCase()}.vn`,
  ...over,
})

/** A `search_places` result as the tool builds it, for one of its three domains. */
const placesResult = (domain: 'food' | 'spa' | 'entertainment', names: string[]) => ({
  source: 'Google Maps',
  count: names.length,
  results: names.map(n => placeRow(n)),
  _tappy_place_domain: domain,
  _tappy_shortlist: names.slice(0, 3).map((n, i) => ({ rank: i, id: `g-${n}`, name: n, role: i === 0 ? 'best_overall' : 'value_gem' })),
})

const pick = (name: string) => ({
  name,
  reasons: [{ attribute: 'rating', evidence: '4.7⭐ · 210 đánh giá' }],
  tradeOff: { attribute: 'distance', evidence: 'xa hơn lựa chọn kia khoảng 1km' },
})

describe('FOOD — a decision, not a list', () => {
  const recs = placeRecommendations(placesResult('food', ['AnAn', 'Cosa', 'HAN']), 'Hà Nội', pick('AnAn'))
  const view = buildPlacesLiveView(recs)!

  it('surfaces the pick with the facts a user scans', () => {
    expect(view.domain).toBe('food')
    expect(view.items[0].name).toBe('AnAn')
    expect(view.items[0].rating).toBe(4.7)
    expect(view.items[0].ratingCount).toBe(210)
    expect(view.items[0].address).toContain('Hoàn Kiếm')
    expect(view.items[0].openingHours).toBe('08:00–22:30')
    expect(view.items[0].openNow).toBe(true)
    expect(view.items[0].priceLevel).toBe(2)
  })

  it('carries the engine\'s own reason and trade-off, not a written-up one', () => {
    expect(view.items[0].reasons?.[0].evidence).toContain('210')
    expect(view.items[0].tradeOff?.evidence).toContain('xa hơn')
  })

  it('ranks the alternatives behind it, each a complete option', () => {
    expect(view.items.map(i => i.name)).toEqual(['AnAn', 'Cosa', 'HAN'])
    for (const item of view.items) expect(item.actions.length).toBeGreaterThan(0)
  })

  it('every action has a real destination', () => {
    for (const item of view.items) {
      for (const a of item.actions) expect(a.url).toMatch(/^https?:\/\//)
    }
  })
})

describe('SPA and ENTERTAINMENT — same channel, own domain', () => {
  it('a spa turn is labelled spa', () => {
    const view = buildPlacesLiveView(placeRecommendations(placesResult('spa', ['Sen Spa', 'Zen']), 'Hà Nội', pick('Sen Spa')))!
    expect(view.domain).toBe('spa')
    expect(view.items[0].name).toBe('Sen Spa')
  })

  it('🚨 a spa card invents no treatment, therapist or booking field', () => {
    const view = buildPlacesLiveView(placeRecommendations(placesResult('spa', ['Sen Spa', 'Zen']), 'Hà Nội', pick('Sen Spa')))!
    const keys = Object.keys(view.items[0])
    for (const forbidden of ['treatments', 'services', 'therapist', 'duration', 'appointment', 'bookingSlot']) {
      expect(keys).not.toContain(forbidden)
    }
    expect(view.items[0].actions.some(a => a.kind === 'reservation' || a.kind === 'booking')).toBe(false)
  })

  it('an entertainment venue turn is labelled entertainment', () => {
    const view = buildPlacesLiveView(placeRecommendations(placesResult('entertainment', ['Karaoke Nice', 'Bowling Hub']), 'Hà Nội', pick('Karaoke Nice')))!
    expect(view.domain).toBe('entertainment')
    expect(view.items[0].name).toBe('Karaoke Nice')
  })
})

describe('TRAVEL — hotels decide, flights and transport do not', () => {
  const hotelResult = {
    location: 'Đà Nẵng',
    source: 'Booking/Agoda + OSM',
    search_results: [
      { title: 'TTR Skypool Boutique Hotel - Đà Nẵng', link: 'https://www.booking.com/hotel/vn/ttr-skypool.html', snippet: 'Hồ bơi vô cực', photo_url: 'https://img/ttr.jpg' },
      { title: 'Sala Danang Beach Hotel - Đà Nẵng', link: 'https://www.booking.com/hotel/vn/sala.html', snippet: 'Gần biển Mỹ Khê' },
    ],
    hotel_list: [],
    booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang',
    agoda_link: 'https://www.agoda.com/search?city=DaNang',
    _tappy_shortlist: [
      { rank: 0, id: 'h1', name: 'TTR Skypool Boutique Hotel', role: 'best_overall' },
      { rank: 1, id: 'h2', name: 'Sala Danang Beach Hotel', role: 'value_gem' },
    ],
  }

  it('a hotel turn produces the same decision shape, with a booking action', () => {
    const view = buildPlacesLiveView(stayRecommendations(hotelResult, pick('TTR Skypool Boutique Hotel')))!
    expect(view.items[0].name).toBe('TTR Skypool Boutique Hotel')
    expect(view.items[1].name).toBe('Sala Danang Beach Hotel')
    expect(view.items[0].actions.some(a => a.url.includes('booking.com'))).toBe(true)
  })

  it('🚨 a flight result yields NO decision — that domain has no ranking', () => {
    const flights = {
      flights: [{ price_vnd: 1_290_000, airline: 'Vietjet Air', flight_number: 'VJ123', departure_at: '2026-09-20' }],
      booking_links: [{ name: 'Traveloka', url: 'https://traveloka.com/x' }],
    }
    expect(placeRecommendations(flights)).toEqual([])
    expect(buildPlacesLiveView(placeRecommendations(flights))).toBeNull()
  })

  it('🚨 a transport result yields NO decision either', () => {
    const transport = {
      distance_km: 12.4,
      estimated_fare_vnd: { low: 150_000, high: 220_000 },
      apps: [{ name: 'Grab', url: 'https://grab.com' }],
    }
    expect(buildPlacesLiveView(placeRecommendations(transport))).toBeNull()
  })
})

describe('the card stays silent where the engine did not decide', () => {
  it('leads with the shortlist head when the engine declined a Pick but marked one best_overall', () => {
    // The live shape for a bare request: shortlist present, `_tappy_ranking`
    // absent. The reply is required to open by naming that place (R1b), so the
    // card shows the same one rather than sitting out its own decision.
    const recs = placeRecommendations(placesResult('food', ['AnAn', 'Cosa']), 'Hà Nội')
    const view = buildPlacesLiveView(recs)
    expect(view?.items[0].name).toBe('AnAn')
    expect(view?.items[0].recommended).toBeUndefined()
  })

  it('🚨 a result with NO shortlist renders UNRANKED, never as prose', () => {
    // Contract changed 2026-09-08. Returning null here meant no card, and the
    // stream filter then injected loose images and bare links into the prose —
    // which is how ten real malls and four real cinemas came out as the old
    // layout. The places are shown; the RANKING claim is what is withheld.
    const noShortlist = { ...placesResult('food', ['AnAn', 'Cosa']), _tappy_shortlist: undefined }
    const view = buildPlacesLiveView(placeRecommendations(noShortlist, 'Hà Nội'))
    expect(view).not.toBeNull()
    expect(view!.ranked).toBe(false)
    expect(view!.items.map(i => i.name)).toEqual(['AnAn', 'Cosa'])
    expect(view!.items.some(i => i.recommended)).toBe(false)
  })

  it('🚨 an empty retrieval produces nothing to render', () => {
    expect(buildPlacesLiveView(placeRecommendations({ results: [], place_search_status: 'empty' }))).toBeNull()
  })

  it('🚨 SHOPPING keeps its own decision surface — this channel never renders a product', () => {
    const shopping = {
      query: 'laptop',
      search_results: [
        { title: 'MacBook Air M2 16GB 512GB', link: 'https://shopee.vn/x-i.1.1', price: '25.800.000₫', price_vnd: 25_800_000, source: 'Shopee' },
        { title: 'MacBook Air M2 8GB 256GB', link: 'https://tiki.vn/y-p2.html', price: '21.000.000₫', price_vnd: 21_000_000, source: 'Tiki' },
      ],
      _tappy_shortlist: [{ rank: 0, id: 's1', name: 'MacBook Air M2 16GB 512GB', role: 'best_overall' }],
      _tappy_ranking: { pick: 'MacBook Air M2 16GB 512GB' },
    }
    const recs = productRecommendations(shopping)
    expect(recs.length).toBeGreaterThan(0)
    expect(buildPlacesLiveView(recs)).toBeNull()
  })
})
