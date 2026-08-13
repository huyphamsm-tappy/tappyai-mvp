import { describe, it, expect } from 'vitest'
import { splitToolResult, ENRICHMENT_KEYS, createEnrichmentCollector } from './toolResultSplit'

// The system prompt forbids the model from writing any of this itself — photos,
// order links and platform links are injected positionally by
// applyPlaceEnrichmentStreamFilter AFTER generation. Sending them into the model
// anyway is paid context that cannot legally be used.
//
// The invariant: enrichment reaches the STREAM (so the user still sees photos and
// order links) but never the MODEL.

const PLACE_RESULT = {
  source: 'Google Maps',
  count: 2,
  results: [
    {
      place_id: 'ChIJabc',
      name: 'Phở Gà Nguyệt',
      address: '5B Phủ Doãn, Hoàn Kiếm, Hà Nội',
      google_rating: '4.5⭐ (2,847 đánh giá Google Maps)',
      tappy_rating: '4.2/5 (11 nguoi dung TappyAI da danh gia)',
      maps_link: 'https://www.google.com/maps/place/?q=place_id:ChIJabc',
      website_uri: 'https://phoganguyet.vn',
      cuisine: 'vietnamese, noodles',
      opening_hours: '06:00-22:00',
      distance_km: 1.2,
      photo_url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&s=10',
      photo_urls: [
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&s=10',
        'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB&s=10',
      ],
      order_links: [
        { name: 'ShopeeFood', url: 'https://shopeefood.vn/tim-kiem?q=Ph%E1%BB%9F%20G%C3%A0%20Nguy%E1%BB%87t' },
        { name: 'GrabFood', url: 'https://food.grab.com/vn/en/s?searchKeyword=Ph%E1%BB%9F%20G%C3%A0' },
        { name: 'BeFood', url: 'https://be.com.vn/' },
      ],
    },
    {
      name: 'Bún Chả Hương Liên',
      address: '24 Lê Văn Hưu, Hai Bà Trưng',
      maps_link: 'https://www.google.com/maps?q=21.0,105.8',
      photo_urls: ['https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcCCCCC&s=10'],
      platform_links: [
        { name: 'Official Website', url: 'https://bunchahuonglien.com' },
        { name: 'Google Maps', url: 'https://www.google.com/maps?q=21.0,105.8' },
      ],
    },
  ],
  price_search_results: [
    { title: 'Menu Phở Gà Nguyệt', link: 'https://foody.vn/x', snippet: 'Phở gà 45.000đ' },
  ],
  google_maps_search: 'https://maps.google.com/maps?q=pho+ga+Ha+Noi',
}

describe('splitToolResult', () => {
  it('strips every enrichment key from the model-facing result', () => {
    const { model } = splitToolResult('search_places', PLACE_RESULT)
    const serialized = JSON.stringify(model)
    for (const key of ENRICHMENT_KEYS) {
      expect(serialized, `"${key}" must not reach the model`).not.toContain(`"${key}"`)
    }
    // The gstatic image host is the single biggest offender by bytes.
    expect(serialized).not.toContain('gstatic.com')
    expect(serialized).not.toContain('shopeefood.vn/tim-kiem')
  })

  it('keeps everything the model actually reasons and writes with', () => {
    const { model } = splitToolResult('search_places', PLACE_RESULT)
    const s = JSON.stringify(model)
    for (const kept of [
      'Phở Gà Nguyệt', 'Bún Chả Hương Liên',          // names
      '5B Phủ Doãn', '24 Lê Văn Hưu',                  // addresses
      'google_rating', 'tappy_rating',                 // rating rules
      'maps_link', 'website_uri',                      // CTA button rules
      'cuisine', 'opening_hours', 'distance_km',       // decision-useful detail
      'price_search_results', 'google_maps_search',    // prose the model must summarize
      'place_id',
    ]) {
      expect(s, `"${kept}" is model-relevant and must survive`).toContain(kept)
    }
  })

  it('hands the stripped enrichment back for server-side injection', () => {
    const { enrichment } = splitToolResult('search_places', PLACE_RESULT)
    expect(enrichment).toHaveLength(2)
    expect(enrichment[0].name).toBe('Phở Gà Nguyệt')
    expect(enrichment[0].photo_urls).toHaveLength(2)
    expect(enrichment[0].order_links).toHaveLength(3)
    expect(enrichment[1].platform_links).toHaveLength(2)
    // The name must ride along or nothing can be matched back to its place.
    expect(enrichment[1].name).toBe('Bún Chả Hương Liên')
  })

  it('handles search_results-shaped tools (hotels, products)', () => {
    const hotelResult = {
      search_results: [
        { title: 'TTR Skypool Hotel - Da Nang - Booking.com', link: 'https://booking.com/hotel/vn/ttr.html', snippet: 'từ 850.000đ', photo_urls: ['https://encrypted-tbn0.gstatic.com/images?q=tbn:XYZ'] },
      ],
      booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang',
    }
    const { model, enrichment } = splitToolResult('get_hotel_prices', hotelResult)
    expect(JSON.stringify(model)).not.toContain('gstatic.com')
    expect(JSON.stringify(model)).toContain('TTR Skypool Hotel')
    expect(JSON.stringify(model)).toContain('booking_link')
    expect(enrichment[0].photo_urls).toHaveLength(1)
    // 'title' stands in for 'name' on these tools — the filter matches on name.
    expect(enrichment[0].name).toBe('TTR Skypool Hotel')
  })

  it('leaves non-place tools untouched', () => {
    const weather = { temp_C: 31, condition: 'Sunny', chance_of_rain_percent: 10 }
    const { model, enrichment } = splitToolResult('get_weather', weather)
    expect(model).toEqual(weather)
    expect(enrichment).toHaveLength(0)
  })

  it('survives malformed or empty results without throwing', () => {
    for (const bad of [null, undefined, {}, { results: null }, { results: 'nope' }, 42, 'text']) {
      expect(() => splitToolResult('search_places', bad)).not.toThrow()
    }
    expect(splitToolResult('search_places', { results: [] }).enrichment).toHaveLength(0)
  })
})

describe('enrichment collector — request scoping', () => {
  it('two collectors never share state', () => {
    const a = createEnrichmentCollector()
    const b = createEnrichmentCollector()
    a.add([{ name: 'A place', photo_urls: ['https://x/1'] }])
    b.add([{ name: 'B place', photo_urls: ['https://x/2'] }])
    expect(a.places.map(p => p.name)).toEqual(['A place'])
    expect(b.places.map(p => p.name)).toEqual(['B place'])
  })

  it('accumulates across several tool calls, as a trip plan needs', () => {
    const c = createEnrichmentCollector()
    c.add([{ name: 'Hotel X', photo_urls: ['https://x/h'] }])
    c.add([{ name: 'Restaurant Y', photo_urls: ['https://x/r'] }])
    expect(c.places).toHaveLength(2)
  })

  it('dedupes by name and upgrades a photoless entry when a photo arrives', () => {
    const c = createEnrichmentCollector()
    c.add([{ name: 'Quán A' }])
    c.add([{ name: 'quán a', photo_urls: ['https://x/a'] }])
    expect(c.places).toHaveLength(1)
    expect(c.places[0].photo_urls).toEqual(['https://x/a'])
  })

  it('ignores entries with no usable name', () => {
    const c = createEnrichmentCollector()
    c.add([{ name: '' }, { name: '   ' }, {} as { name?: string }])
    expect(c.places).toHaveLength(0)
  })
})
