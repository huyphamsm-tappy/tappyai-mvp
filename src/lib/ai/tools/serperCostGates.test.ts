import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchPlaces } from './food'
import { __clearToolCache } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// COST GATES THAT DO NOT COST QUALITY.
//
// The product rule this file enforces: optimise the RETRIEVAL STRATEGY, never
// the answer. Every assertion here is about not buying something we already
// have, or not buying something nobody asked for — never about withholding a
// field the user should see.
//
// Measured baseline before this pass, per food turn:
//   2 × /search (price + order) + 3 × /images  = 5 credits
//   → 0 rating, 0 review count, 0 price, 3/6 photos
// After:
//   1 × /maps = 3 credits
//   → rating, ratingCount, phone, hours, category, website, photo, address
// ─────────────────────────────────────────────────────────────────────────────

interface Call { url: string; body: Record<string, unknown> }
let calls: Call[]

const MAPS_ROW = {
  title: 'Bún bò Huế - Bến Ngự',
  address: '585 Huỳnh Tấn Phát, Quận 7, Hồ Chí Minh',
  latitude: 10.74105, longitude: 106.72996,
  rating: 4.4, ratingCount: 589,
  type: 'Quán ăn nhỏ', types: ['Quán ăn nhỏ'],
  phoneNumber: '+84 917 607 088',
  openingHours: { 'Thứ Năm': '06:00–20:00' },
  thumbnailUrl: 'https://lh3.googleusercontent.com/x',
  cid: '8252027741556609696',
}

function stub() {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    let body: Record<string, unknown> = {}
    try { body = JSON.parse(String(init?.body ?? '{}')) } catch { /* GET */ }
    calls.push({ url, body })
    if (url.includes('/maps')) return new Response(JSON.stringify({ places: [MAPS_ROW], credits: 3 }), { status: 200 })
    if (url.includes('/search')) return new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://x/1', snippet: 's' }] }), { status: 200 })
    if (url.includes('/images')) return new Response(JSON.stringify({ images: [{ imageUrl: 'https://img/a.jpg', imageWidth: 800, imageHeight: 600 }] }), { status: 200 })
    return new Response(JSON.stringify({}), { status: 200 })
  }))
}

const hits = (fragment: string) => calls.filter(c => c.url.includes(fragment)).length

beforeEach(() => {
  __clearToolCache()
  stub()
  // Places must be absent so the Serper branch is the one under test — which is
  // also the real production condition this work was done for.
  vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
  vi.stubEnv('SERPER_API_KEY', 'test-key')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('the place turn buys ONE structured request', () => {
  it('calls /maps and does not fall through to OSM when it answers', async () => {
    await searchPlaces('quán bún bò ngon', 'TP.HCM', undefined, 'vi', { lat: 10.7756, lng: 106.7019 })
    expect(hits('/maps')).toBe(1)
    expect(hits('overpass')).toBe(0)
  })

  /**
   * 🚨 THE SINGLE BIGGEST SAVING, AND THE ONE MOST EASILY REGRESSED. `/maps`
   * returns `thumbnailUrl` WITH the record. `/images` is the highest-volume
   * billed call in the product, and buying a photo we were just handed is pure
   * waste — measured at one credit per place per turn.
   */
  it('buys NO /images when the provider already supplied a thumbnail', async () => {
    await searchPlaces('quán bún bò ngon', 'TP.HCM', undefined, 'vi', { lat: 10.7756, lng: 106.7019 })
    expect(hits('/images')).toBe(0)
  })
})

describe('price snippets are bought on intent, not by default', () => {
  it('does NOT buy the price search for a plain recommendation ask', async () => {
    await searchPlaces('quán bún bò ngon', 'TP.HCM', undefined, 'vi', { lat: 10.7756, lng: 106.7019 })
    const priceSearches = calls.filter(c => c.url.includes('/search') && /gia menu thuc don/.test(String(c.body.q)))
    expect(priceSearches).toHaveLength(0)
  })

  /**
   * 🔑 AND THE OTHER HALF: A PRICE QUESTION STILL GETS THE DEEPER SEARCH. The
   * gate exists to stop paying for what nobody asked, never to withhold what
   * they did.
   */
  it('DOES buy it when the user actually asks about price', async () => {
    await searchPlaces('quán bún bò giá rẻ bao nhiêu tiền', 'TP.HCM', undefined, 'vi', { lat: 10.7756, lng: 106.7019 })
    const priceSearches = calls.filter(c => c.url.includes('/search') && /gia menu thuc don/.test(String(c.body.q)))
    expect(priceSearches.length).toBeGreaterThan(0)
  })
})

describe('the structured fields actually reach the tool result', () => {
  it('a /maps turn carries rating, phone, hours and category on the row', async () => {
    const r = await searchPlaces('quán bún bò ngon', 'TP.HCM', undefined, 'vi', { lat: 10.7756, lng: 106.7019 }) as {
      source?: string
      results?: Array<Record<string, unknown>>
    }
    expect(r.source).toBe('Serper Maps')
    const row = r.results![0]
    expect(row.rating_value).toBe(4.4)
    expect(row.rating_count).toBe(589)
    expect(row.phone).toBe('+84 917 607 088')
    expect(row.place_types).toEqual(['Quán ăn nhỏ'])
    expect(row.maps_link).toContain('cid=8252027741556609696')
  })
})
