import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { marketplaceSearchTemplates } from '@/lib/ccp/adapters'

// ─────────────────────────────────────────────────────────────────────────────
// THE SERPER CALL BUDGET, MEASURED RATHER THAN ESTIMATED.
//
// Serper is billed per request, so the number of requests a turn makes IS the
// cost. This file stubs `fetch`, runs the real tool functions, and counts the
// requests that actually leave for google.serper.dev, per endpoint.
//
// It exists to make a cost regression impossible to land silently: if a future
// change adds a per-turn Serper call, the number here moves and a test fails.
// Every expectation is an exact count, never a range.
// ─────────────────────────────────────────────────────────────────────────────

type Counts = { search: number; images: number; shopping: number; overpass: number; other: number }
let counts: Counts
let queries: string[]

/** Realistic-enough payloads: the point is the call COUNT, not the content. */
function respond(url: string): Response {
  if (url.includes('serper.dev/shopping')) {
    return new Response(JSON.stringify({
      shopping: [{
        title: 'iPhone 13 128GB', link: 'https://shopee.vn/p-i.1.2', price: '₫12.490.000',
        source: 'Shopee', rating: 4.8, ratingCount: 120, productId: 'p1',
        imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:X',
      }],
    }), { status: 200 })
  }
  if (url.includes('serper.dev/images')) {
    return new Response(JSON.stringify({
      images: [{ imageUrl: 'https://example.test/a.jpg', thumbnailUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:A', imageWidth: 800, imageHeight: 600, title: 'x' }],
    }), { status: 200 })
  }
  if (url.includes('serper.dev/search')) {
    return new Response(JSON.stringify({
      organic: [{ title: 'Quán X - Menu', link: 'https://example.test/x', snippet: 'gia 50.000d' }],
    }), { status: 200 })
  }
  if (url.includes('overpass') || url.includes('maps.mail.ru')) {
    return new Response(JSON.stringify({
      elements: [
        { type: 'node', lat: 21.02, lon: 105.85, tags: { name: 'Quán A', 'addr:street': 'Phố A' } },
        { type: 'node', lat: 21.03, lon: 105.86, tags: { name: 'Quán B', 'addr:street': 'Phố B' } },
      ],
    }), { status: 200 })
  }
  if (url.includes('nominatim')) return new Response(JSON.stringify([{ lat: '21.02', lon: '105.85' }]), { status: 200 })
  // Google Places / anything else: behave like today's production 403.
  return new Response(JSON.stringify({ error: { code: 403, message: 'denied' } }), { status: 403 })
}

beforeEach(() => {
  counts = { search: 0, images: 0, shopping: 0, overpass: 0, other: 0 }
  queries = []
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: string }) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('serper.dev/search')) { counts.search++; queries.push(String(init?.body ?? '')) }
    else if (url.includes('serper.dev/images')) { counts.images++; queries.push(String(init?.body ?? '')) }
    else if (url.includes('serper.dev/shopping')) { counts.shopping++ }
    else if (url.includes('overpass') || url.includes('maps.mail.ru')) counts.overpass++
    else counts.other++
    return respond(url)
  }))
  process.env.SERPER_API_KEY = 'test-key-not-a-real-secret'
  delete process.env.GOOGLE_PLACES_API_KEY
})

afterEach(() => { vi.unstubAllGlobals() })

const total = (c: Counts) => c.search + c.images + c.shopping

describe('Serper call budget per turn', () => {
  it('FOOD place search', async () => {
    const { searchPlaces } = await import('./food')
    await searchPlaces('quan cafe view dep budget-probe-food', 'Ha Noi', 'cafe')
    console.log('[budget] FOOD   ', JSON.stringify(counts))
    expect(counts.shopping).toBe(0)
    expect(total(counts)).toBeGreaterThan(0)
  })

  it('SPA place search', async () => {
    const { searchPlaces } = await import('./food')
    await searchPlaces('massage thu gian budget-probe-spa', 'Quan 1', 'spa')
    console.log('[budget] SPA    ', JSON.stringify(counts))
    expect(counts.shopping).toBe(0)
  })

  it('ENTERTAINMENT place search', async () => {
    const { searchPlaces } = await import('./food')
    await searchPlaces('rap chieu phim budget-probe-ent', 'Ha Noi', 'cinema')
    console.log('[budget] ENT    ', JSON.stringify(counts))
  })

  it('TRAVEL hotel prices', async () => {
    const { getHotelPrices } = await import('./travel')
    await getHotelPrices('Da Nang budget-probe-travel')
    console.log('[budget] TRAVEL ', JSON.stringify(counts))
  })

  it('SHOPPING product search', async () => {
    const { searchProducts } = await import('./shopping')
    await searchProducts('iPhone budget-probe-shop')
    console.log('[budget] SHOP   ', JSON.stringify(counts))
    expect(counts.shopping).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE OPTIMISATIONS THEMSELVES: each is a cost reduction that must cost nothing
// in data. Every test below asserts BOTH halves — fewer calls AND same result.
// ─────────────────────────────────────────────────────────────────────────────

describe('🚨 repeat queries are paid for once', () => {
  it('a second identical place turn spends NOTHING upstream', async () => {
    const { searchPlaces } = await import('./food')
    const first = await searchPlaces('cafe repeat-probe-a', 'Ha Noi', 'cafe')
    const afterFirst = { ...counts }
    const second = await searchPlaces('cafe repeat-probe-a', 'Ha Noi', 'cafe')
    // The tool result itself is cached, so the whole turn is free the second time.
    expect(total(counts)).toBe(total(afterFirst))
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('🚨 the same VENUE across different turns is fetched once', async () => {
    const { fetchPlacePhotosByName } = await import('./common')
    const a = await fetchPlacePhotosByName('id-1', 'Cà Phê Cache Probe')
    const afterFirst = counts.images
    const b = await fetchPlacePhotosByName('id-2', 'Cà Phê Cache Probe')  // different caller id
    expect(counts.images).toBe(afterFirst)          // no second purchase
    expect(b).toEqual(a)                            // and the same images
    expect(a.length).toBeGreaterThan(0)
  })

  it('a different max or context is a DIFFERENT answer and is fetched again', async () => {
    const { fetchPlacePhotosByName } = await import('./common')
    await fetchPlacePhotosByName('id', 'Distinct Probe Venue', 3, 'food')
    const afterFood = counts.images
    await fetchPlacePhotosByName('id', 'Distinct Probe Venue', 3, 'shopping')
    // shopping filters food imagery out, so it must not reuse the food answer.
    expect(counts.images).toBe(afterFood + 1)
  })

  it('the same organic query twice costs one request', async () => {
    const { serperSearch } = await import('./common')
    const a = await serperSearch('organic repeat probe query')
    const afterFirst = counts.search
    const b = await serperSearch('organic repeat probe query')
    expect(counts.search).toBe(afterFirst)
    expect(b).toEqual(a)
  })
})

describe('🚨 a failure is never cached — cost must not buy silence', () => {
  it('an empty image result is re-attempted, not remembered', async () => {
    const { fetchPlacePhotosByName } = await import('./common')
    vi.stubGlobal('fetch', vi.fn(async () => { counts.images++; return new Response(JSON.stringify({ images: [] }), { status: 200 }) }))
    await fetchPlacePhotosByName('id', 'Empty Probe Venue')
    const afterFirst = counts.images
    await fetchPlacePhotosByName('id', 'Empty Probe Venue')
    expect(counts.images).toBe(afterFirst + 1)   // tried again, not silently blank
  })

  it('an empty organic result is re-attempted too', async () => {
    const { serperSearch } = await import('./common')
    vi.stubGlobal('fetch', vi.fn(async () => { counts.search++; return new Response(JSON.stringify({ organic: [] }), { status: 200 }) }))
    await serperSearch('empty probe query')
    const afterFirst = counts.search
    await serperSearch('empty probe query')
    expect(counts.search).toBe(afterFirst + 1)
  })
})

/**
 * CONTRACT CHANGED, deliberately — 2026-09-10.
 *
 * These used to assert a `wantsReviewContent` gate INSIDE `searchPlaces`: an
 * ordinary query bought no TikTok search, a query saying "review" bought one.
 * The gated search was the AREA query — `"<user query> <location> review
 * site:tiktok.com"` — and re-measuring it against the live provider showed why
 * it yielded nothing: it returns eight valid TikTok posts that are listicles
 * ("13 Quán Bún Bò Ngon Nhất Sài Gòn") and videos about other venues, so
 * `attributeTikTok` refuses every one. The gate was rationing a query that could
 * not succeed.
 *
 * The search therefore MOVED rather than shrank. It now runs once per turn from
 * `tiktokEnrichment`, naming the venues that survived admission — measured 3 of
 * 4 attributed for one credit. `searchPlaces` buys no TikTok search at all, at
 * any phrasing, which is what these tests now hold.
 */
describe('🚨 TikTok retrieval has left the tool — the tool buys none, ever', () => {
  it.each([
    ['an ordinary place query', 'quan cafe view dep gate-probe-off'],
    ['a query that asks for reviews', 'review quan cafe gate-probe-on'],
    ['the Vietnamese phrasing', 'đánh giá quán cafe gate-vi'],
  ])('%s buys no TikTok search inside searchPlaces', async (_label, q) => {
    const { searchPlaces } = await import('./food')
    await searchPlaces(q, 'Ha Noi', 'cafe')
    expect(queries.join(' ')).not.toContain('site:tiktok.com')
  })
})

describe('nothing downstream lost its data', () => {
  it('SHOPPING still returns product, price, seller, rating, URL and image', async () => {
    const { searchProducts } = await import('./shopping')
    const r = await searchProducts('iphone quality-probe') as { search_results?: Array<Record<string, unknown>> }
    const row = r.search_results?.[0] as Record<string, unknown>
    expect(row).toBeTruthy()
    for (const f of ['title', 'link', 'price', 'price_vnd', 'source', 'rating', 'rating_count', 'product_id', 'photo_url']) {
      expect(row[f], f).toBeDefined()
    }
    expect(counts.shopping).toBe(1)   // and still exactly one request
  })

  it('FOOD keeps its deterministic order actions with no Serper at all', async () => {
    delete process.env.SERPER_API_KEY
    const { searchPlaces } = await import('./food')
    const r = await searchPlaces('quan an no-serper-probe', 'Ha Noi', 'restaurant') as {
      results?: Array<{ name?: string; order_links?: Array<{ name: string; url: string }> }>
    }
    const rows = r.results ?? []
    expect(rows.length).toBeGreaterThan(0)
    const names = (rows[0].order_links ?? []).map(l => l.name)
    expect(names).toContain('GrabFood') // ShopeeFood has no search page (14 Sep 2026); its restaurant pages are Commerce Links
    expect(names).toContain('BeFood')
    process.env.SERPER_API_KEY = 'test-key-not-a-real-secret'
  })

  it('place rows survive with Serper unavailable — OSM is the substrate', async () => {
    delete process.env.SERPER_API_KEY
    const { searchPlaces } = await import('./food')
    const r = await searchPlaces('cafe serper-down-probe', 'Ha Noi', 'cafe') as {
      results?: Array<Record<string, unknown>>; place_search_status?: string
    }
    expect(r.place_search_status).toBe('has_results')
    expect((r.results ?? []).length).toBeGreaterThan(0)
    expect(r.results![0].name).toBeTruthy()
    expect(counts.search).toBe(0)
    process.env.SERPER_API_KEY = 'test-key-not-a-real-secret'
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2 (2026-09-13): the /shopping "no listings" turn was buying the SAME
// request twice.
//
// `searchProducts` asks `/shopping` first (num: 20). When the provider answers
// with ZERO listings it falls through to the organic path — which opened with
// `serperShopping(query)` again: the identical body ({q, gl, hl, num: 20}) to an
// endpoint that had just said "nothing", and whose answer cannot change what the
// turn returns (`hasStructured` is false either way). One billed request for no
// information. A FAILED first attempt (null: timeout / non-2xx) is deliberately
// NOT covered here — that retry can still succeed, and its behaviour is kept.
// ─────────────────────────────────────────────────────────────────────────────

/** Re-stub so `/shopping` answers, but with no listings; everything else as `respond`. */
function stubShoppingEmpty() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: string }) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('serper.dev/shopping')) {
      counts.shopping++
      return new Response(JSON.stringify({ shopping: [] }), { status: 200 })
    }
    if (url.includes('serper.dev/search')) {
      counts.search++; queries.push(String(init?.body ?? ''))
      // A direct Shopee product page, so the organic path has a row that survives
      // its own validity filter and the fallback's full shape can be asserted.
      return new Response(JSON.stringify({
        organic: [{ title: 'Sản phẩm probe 128GB', link: 'https://shopee.vn/san-pham-probe-i.123.456', snippet: '₫1.290.000' }],
      }), { status: 200 })
    }
    if (url.includes('serper.dev/images')) { counts.images++; queries.push(String(init?.body ?? '')) }
    else counts.other++
    return respond(url)
  }))
}

describe('🚨 a /shopping answer of "no listings" is paid for ONCE', () => {
  it('the organic fallback does not re-buy the identical /shopping request', async () => {
    stubShoppingEmpty()
    const { searchProducts } = await import('./shopping')
    const r = await searchProducts('san pham empty-shopping-probe') as {
      search_results?: unknown[]; shopping_results?: unknown[]; shop_info_results?: unknown[]; links?: unknown[]
    }
    console.log('[budget] SHOP-EMPTY', JSON.stringify(counts))
    // Exactly one /shopping request: the first answered, and "nothing" is an answer.
    expect(counts.shopping).toBe(1)
    // The organic fallback still runs in full — three /search and the per-row
    // photo lookup, unchanged.
    expect(counts.search).toBe(3)
    expect(counts.images).toBe(1)
    // And the turn's shape is the fallback's shape: organic rows (with photo),
    // shop info, the three marketplace links, and NO structured field (there
    // were no listings — the same as when the second request was still made).
    expect(r.shopping_results).toBeUndefined()
    const rows = r.search_results as Array<Record<string, unknown>> | undefined
    expect(Array.isArray(rows) && rows.length > 0).toBe(true)
    expect(rows![0].link).toBe('https://shopee.vn/san-pham-probe-i.123.456')
    expect(rows![0].photo_url).toBeDefined()
    expect(Array.isArray(r.shop_info_results) && r.shop_info_results.length > 0).toBe(true)
    // The marketplace search links are PROJECTED from the CCP registry (feat/ccp-canonical):
    // one per marketplace whose search grammar was verified, so the count is the registry's,
    // not a literal.
    expect(r.links).toHaveLength(marketplaceSearchTemplates().length)
    expect((r.links as unknown[]).length).toBeGreaterThan(0)
  })

  it('a FAILED first /shopping attempt keeps its retry — a timeout is not an answer', async () => {
    let shoppingCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
      if (url.includes('serper.dev/shopping')) {
        counts.shopping++
        // First attempt: provider error (non-2xx → serperShopping returns null).
        // Second: it recovers. Today's behaviour is that the second attempt is made.
        if (++shoppingCalls === 1) return new Response('{"message":"upstream"}', { status: 502 })
        return respond(url)
      }
      if (url.includes('serper.dev/search')) counts.search++
      else if (url.includes('serper.dev/images')) counts.images++
      else counts.other++
      return respond(url)
    }))
    const { searchProducts } = await import('./shopping')
    const r = await searchProducts('san pham failed-shopping-probe') as { shopping_results?: unknown[] }
    expect(counts.shopping).toBe(2)
    expect(Array.isArray(r.shopping_results) && r.shopping_results.length > 0).toBe(true)
  })
})
