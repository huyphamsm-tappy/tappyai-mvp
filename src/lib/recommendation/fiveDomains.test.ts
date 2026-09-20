import { describe, it, expect } from 'vitest'
import { placeRecommendations, productRecommendations, stayRecommendations } from './fromToolResult'
import { isKnown } from './entity'

// ── PARTS 10 & 13 — one architecture, five domains, no invented fields ──────
//
// The rule these tests defend is as much about what is ABSENT as what is
// present. Entertainment has no ticket source and Spa has no service catalogue,
// so an entity from either must carry no ticket action and no service list — a
// card that offered one would be promising something the data cannot support.

const placeResult = (domain: string, rows: Record<string, unknown>[], source = 'Google Maps') => ({
  source,
  count: rows.length,
  _tappy_place_domain: domain,
  results: rows,
  _tappy_shortlist: rows.map((r, i) => ({ rank: i, id: `x${i}`, name: r.name as string, role: i === 0 ? 'best_overall' : 'alternative' })),
  _tappy_ranking: { name: rows[0]?.name },
})

describe('FOOD', () => {
  const recs = placeRecommendations(placeResult('food', [{
    place_id: 'ChIJ1', name: 'Bún Bò Cô Ba', address: '12 Lê Lợi', rating_value: 4.6, rating_count: 900,
    opening_hours: 'Mo-Su 06:00-21:00', phone: '+84 28 1', maps_link: 'https://maps.google.com/?cid=1',
    website_uri: 'https://coba.example', price_level: 1, lat: 10.77, lng: 106.7, cuisine: 'vietnamese',
    order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=bun' }],
    // A3.3: the CTA is the venue's OWN page on the platform (entity-scoped evidence), never its search.
    order_search_results: [{ title: 'Bún Bò Cô Ba - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/bun-bo-co-ba-12-le-loi', snippet: '', evidence_scope: 'entity', evidence_about: 'Bún Bò Cô Ba' }],
  }]))

  it('produces a recommendation with the shortlist position the ranker chose', () => {
    expect(recs).toHaveLength(1)
    expect(recs[0].shortlistPosition).toBe(1)
    expect(recs[0].role).toBe('best_overall')
    expect(recs[0].recommended).toBe(true)
  })

  it('carries cuisine, price level, hours and an order action (the venue\'s own platform page, never the search)', () => {
    const e = recs[0].entity
    expect((e.ext as { cuisine?: string[] }).cuisine).toEqual(['vietnamese'])
    expect(e.pricing.priceLevel).toBe(1)
    expect(isKnown(e.availability.openingHours)).toBe(true)
    const order = e.actions.filter(a => a.kind === 'order')
    expect(order.map(a => a.url)).toEqual(['https://shopeefood.vn/ho-chi-minh/bun-bo-co-ba-12-le-loi'])
  })

  it('exposes no matchScore', () => {
    expect('matchScore' in recs[0]).toBe(false)
  })
})

describe('SHOPPING', () => {
  const recs = productRecommendations({
    query: 'macbook air',
    source: 'Google Shopping (Serper)',
    search_results: [
      { title: 'MacBook Air M2 16GB', link: 'https://shop.example/a', price: '24.990.000₫', price_vnd: 24990000, source: 'CellphoneS', rating: 4.8, rating_count: 312, product_id: 'p1', photo_url: 'https://cdn.example/a.jpg' },
      { title: 'MacBook Air M1 8GB', link: 'https://shop.example/b', price: '18.990.000₫', price_vnd: 18990000, source: 'FPT', product_id: 'p2' },
    ],
  })

  it('gives every listing a product entity with a direct purchase link', () => {
    expect(recs).toHaveLength(2)
    for (const r of recs) {
      const buy = r.entity.actions.find(a => a.kind === 'purchase')!
      expect(buy.urlKind).toBe('direct')
    }
  })

  it('is the only domain with a FACT-grade price', () => {
    expect(recs[0].entity.pricing.price.evidence_type).toBe('FACT')
  })

  it('keeps seller and image', () => {
    expect((recs[0].entity.ext as { offers: { seller: unknown }[] }).offers[0].seller).toBe('CellphoneS')
    expect(recs[0].entity.images.primary?.url).toBe('https://cdn.example/a.jpg')
  })

  it('does not invent a rating for a listing that had none', () => {
    expect(isKnown(recs[1].entity.quality.rating)).toBe(false)
  })
})

describe('TRAVEL', () => {
  const recs = stayRecommendations({
    location: 'Đà Nẵng',
    booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang',
    agoda_link: 'https://www.agoda.com/vi-vn/search?q=Da+Nang',
    search_results: [{ title: 'Hotel Continental - Da Nang - Booking.com', link: 'https://booking.example/h', photo_url: 'https://cdn.example/h.jpg' }],
    hotel_list: [{ name: 'Khách Sạn Biển', address: '1 Võ Nguyên Giáp', stars: '4', lat: 16.05, lng: 108.24 }],
  })

  it('builds stays from both the snippet list and the OSM list', () => {
    expect(recs.map(r => r.entity.identity.name)).toEqual(expect.arrayContaining(['Hotel Continental', 'Khách Sạn Biển']))
  })

  it('A3.3: offers NO booking search link — a results page is never a CTA; the hotel\'s own OTA page is', () => {
    for (const r of recs) expect(r.entity.actions.some(a => a.kind === 'booking' && a.urlKind === 'search')).toBe(false)
  })

  it('claims no guest rating — snippets carry it, we do not extract it', () => {
    for (const r of recs) expect(isKnown(r.entity.quality.rating)).toBe(false)
  })
})

describe('ENTERTAINMENT', () => {
  const recs = placeRecommendations(placeResult('entertainment', [{
    place_id: 'ChIJ2', name: 'CGV Vincom', address: '72 Lê Thánh Tôn', rating_value: 4.3, rating_count: 8100,
    maps_link: 'https://maps.google.com/?cid=2', website_uri: 'https://cgv.example',
    platform_links: [{ name: 'Official Website', url: 'https://cgv.example' }, { name: 'Google Maps', url: 'https://maps.google.com/?cid=2' }],
  }]))

  it('is the same entity shape as food', () => {
    expect(recs[0].entity.kind).toBe('place')
    expect(recs[0].entity.domain).toBe('entertainment')
  })

  it('has NO ticket action — there is no ticketing integration', () => {
    // 🚨 The honest outcome. A ticket button here would promise something the
    // data cannot support.
    expect(recs[0].entity.actions.some(a => a.kind === 'ticket')).toBe(false)
    expect(recs[0].entity.actions.some(a => a.kind === 'booking')).toBe(false)
  })

  it('has an EMPTY extension — no event, no showtime, no date', () => {
    expect(recs[0].entity.ext).toEqual({})
  })
})

describe('SPA', () => {
  const recs = placeRecommendations(placeResult('spa', [{
    place_id: 'ChIJ3', name: 'Sen Spa', address: '10 Hai Bà Trưng', rating_value: 4.6, rating_count: 1240,
    maps_link: 'https://maps.google.com/?cid=3', website_uri: 'https://senspa.example', phone: '+84 28 3',
    opening_hours: 'Mo-Su 09:00-22:00',
    platform_links: [{ name: 'Official Website', url: 'https://senspa.example' }, { name: 'Google Maps', url: 'https://maps.google.com/?cid=3' }],
  }]))

  it('offers website, maps and call — and no appointment', () => {
    const kinds = new Set(recs[0].entity.actions.map(a => a.kind))
    expect(kinds.has('website')).toBe(true)
    expect(kinds.has('maps')).toBe(true)
    expect(kinds.has('call')).toBe(true)
    expect(kinds.has('reservation')).toBe(false)
  })

  it('has an EMPTY extension — no service catalogue exists', () => {
    expect(recs[0].entity.ext).toEqual({})
  })
})

describe('all five share one core, and none of them fabricates', () => {
  it('every domain produces the same top-level shape', () => {
    const all = [
      placeRecommendations(placeResult('food', [{ name: 'A', place_id: 'a' }]))[0],
      productRecommendations({ search_results: [{ title: 'B', link: 'https://s.example/b' }] })[0],
      // A stay snippet needs a DIRECT entity link to be admitted at all — a bare
      // title is exactly the listicle/search-page shape `admitStays` rejects.
      stayRecommendations({ search_results: [{ title: 'C', link: 'https://c-hotel.example/rooms' }] })[0],
      placeRecommendations(placeResult('entertainment', [{ name: 'D', place_id: 'd' }]))[0],
      placeRecommendations(placeResult('spa', [{ name: 'E', place_id: 'e' }]))[0],
    ]
    for (const r of all) {
      expect(Object.keys(r.entity).sort()).toEqual([
        'actions', 'attributes', 'availability', 'domain', 'ext', 'id', 'identity',
        'images', 'kind', 'location', 'provenance', 'pricing', 'quality', 'reviews', 'v',
      ].sort())
    }
  })

  it('an empty or malformed tool result yields no recommendations, never a throw', () => {
    expect(placeRecommendations(null)).toEqual([])
    expect(placeRecommendations({ results: [] })).toEqual([])
    expect(placeRecommendations({ results: 'not an array' })).toEqual([])
    expect(productRecommendations(undefined)).toEqual([])
    expect(stayRecommendations({})).toEqual([])
  })

  it('a row with no name is dropped rather than becoming a nameless card', () => {
    expect(placeRecommendations(placeResult('food', [{ place_id: 'x' }]))).toEqual([])
  })
})
