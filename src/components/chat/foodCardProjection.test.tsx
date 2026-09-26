// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import PlaceDecision from './PlaceDecision'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { buildPlacesLiveView } from '@/lib/recommendation/liveView'

// ─────────────────────────────────────────────────────────────────────────────
// THE WHOLE PATH, NOT A HAND-WRITTEN VIEW: tool result → recommendations →
// projection → rendered card.
//
// 🚨 WHY THIS EXISTS. Google Places answers HTTP 403 on localhost (the key is
// restricted to the legacy API), so every live Food card falls back to OSM and
// shows no rating, no review count, no open-now and no price band. That makes
// the fields most likely to break the ones least likely to be noticed: a
// projection bug in `rating_value` or `price_level` would look exactly like the
// 403 does.
//
// So the fixture below is a `search_places` result in the shape the tool builds
// when Google DOES answer, and the assertions are made on the DOM a user would
// read. Nothing here stubs the projection — `placeRecommendations` and
// `buildPlacesLiveView` are the real ones.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(cleanup)

/** A row exactly as `searchPlaces` emits it on the Google Places branch. */
const googleRow = (name: string, over: Record<string, unknown> = {}) => ({
  place_id: `ChIJ-${name}`,
  name,
  address: `${name} Street, Quận 1, TP. Hồ Chí Minh`,
  google_rating: `4.8⭐ (320 đánh giá)`,
  rating_value: 4.8,
  rating_count: 320,
  maps_link: `https://www.google.com/maps/place/?q=place_id:ChIJ-${name}`,
  website_uri: `https://${name.toLowerCase()}.vn`,
  opening_hours: '08:00 – 22:30',
  open_now: true,
  phone: '028 3930 7627',
  price_level: 2,
  place_types: ['cafe', 'coffee_shop'],
  lat: 10.7769,
  lng: 106.7009,
  distance_km: 1.2,
  photo_url: `https://img/${name}.jpg`,
  order_links: [{ name: 'ShopeeFood', url: `https://shopeefood.vn/tim-kiem?q=${name}` }],
  ...over,
})

const toolResult = (rows: Record<string, unknown>[]) => ({
  source: 'Google Maps',
  count: rows.length,
  results: rows,
  _tappy_place_domain: 'food',
  google_maps_search: 'https://www.google.com/maps/search/cafe+quan+1',
  _tappy_shortlist: rows.map((r, i) => ({ rank: i, id: `ChIJ-${r.name}`, name: r.name, role: i === 0 ? 'best_overall' : 'value_gem' })),
})

/**
 * `reasons` is a PARAMETER, because the ranker's reasons depend on the data.
 * The 403 case below has no rating at all, so a hardcoded "4.8⭐ · 320 đánh giá"
 * reason would put rating vocabulary on a card that must show none — a fixture
 * asserting the opposite of what the pipeline could produce.
 */
function renderFromTool(
  rows: Record<string, unknown>[],
  reasons: { attribute: string; evidence: string }[] = [{ attribute: 'rating', evidence: '4.8⭐ · 320 đánh giá' }],
) {
  const recs = placeRecommendations(toolResult(rows), 'Quận 1', {
    name: rows[0].name as string,
    reasons,
    tradeOff: null,
  })
  const view = buildPlacesLiveView(recs, { mapsSearchUrl: 'https://www.google.com/maps/search/cafe+quan+1' })
  expect(view, 'the projection produced a decision').not.toBeNull()
  render(<PlaceDecision view={view} />)
  return screen.getAllByTestId('place-card')
}

describe('Google fields reach the card', () => {
  it('renders rating, review count, hours, open-now and price band', () => {
    const [card] = renderFromTool([googleRow('AnAn'), googleRow('Cosa', { rating_value: 4.5, rating_count: 90, open_now: false, price_level: 1 })])

    expect(within(card).getByText('4.8')).toBeTruthy()
    // Scoped to the rating line: the reasons line legitimately repeats the count.
    expect(within(card).getByText(/^\(?320 (đánh giá|reviews)\)?$/)).toBeTruthy()
    expect(within(card).getByText(/08:00 – 22:30/)).toBeTruthy()
    // open-now is a state, not a repeat of the hours string
    expect(within(card).getByText(/đang mở|open now/i)).toBeTruthy()
    // price_level 2 → the two-glyph band, never a made-up amount
    expect(within(card).getByText('₫₫')).toBeTruthy()
    expect(within(card).getByText(/1\.2 km/)).toBeTruthy()
    expect(within(card).getByText(/Quận 1/)).toBeTruthy()
    expect(card.querySelector('img')?.getAttribute('src')).toBe('https://img/AnAn.jpg')
  })

  it('shows a closed venue as closed, and a cheaper band as cheaper', () => {
    const cards = renderFromTool([googleRow('AnAn'), googleRow('Cosa', { rating_value: 4.5, rating_count: 90, open_now: false, price_level: 1 })])
    const second = cards[1]
    expect(within(second).getByText(/đang đóng|closed now/i)).toBeTruthy()
    expect(within(second).getByText('₫')).toBeTruthy()
    expect(within(second).getByText('4.5')).toBeTruthy()
  })

  it('🚨 a row WITHOUT those fields renders none of them — the 403 case', () => {
    // The OSM fallback: name, address and hours only. Nothing may be filled in.
    const [card] = renderFromTool([
      { name: 'Quán Không Số', address: 'Ngô Thời Nhiệm', opening_hours: 'Mo-Su 08:00-22:30', maps_link: 'https://www.google.com/maps?q=10.7,106.7' },
      { name: 'Quán Khác', address: 'Lý Tự Trọng', maps_link: 'https://www.google.com/maps?q=10.8,106.8' },
    ], [{ attribute: 'distance', evidence: 'gần bạn nhất' }])
    expect(within(card).getByText(/Mo-Su 08:00-22:30/)).toBeTruthy()
    expect(within(card).queryByText('₫')).toBeNull()
    expect(within(card).queryByText('₫₫')).toBeNull()
    // 🔑 NO FABRICATED RATING — which is a narrower claim than "the word
    // 'review' never appears". A clearly-labelled "Search reviews on YouTube"
    // button is an ACTION, not a fact about this venue: it promises a search and
    // carries `attributed: false`. What must never appear is a star or a review
    // COUNT for a row whose provider gave neither.
    expect(card.textContent).not.toMatch(/⭐/)
    expect(card.textContent).not.toMatch(/\d+\s*(đánh giá|reviews)/i)
    expect(card.textContent).not.toMatch(/đang mở|đang đóng|open now|closed now/i)
    expect(card.textContent).not.toMatch(/undefined|null|NaN/)
  })
})

describe('actions come from the data, once each', () => {
  it('renders Maps and the website when the row carries them — and NOT the platform search link (A3.3, 2026-09-20)', () => {
    const [card] = renderFromTool([googleRow('AnAn'), googleRow('Cosa')])
    const hrefs = within(card).getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs).toContain('https://www.google.com/maps/place/?q=place_id:ChIJ-AnAn')
    expect(hrefs).not.toContain('https://shopeefood.vn/tim-kiem?q=AnAn')
    expect(hrefs.some(h => (h ?? '').includes('anan.vn')), `website missing from ${JSON.stringify(hrefs)}`).toBe(true)
    // Every destination appears exactly once on the card.
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('🚨 renders a Call action from a REAL phone number, as tel:', () => {
    const [card] = renderFromTool([googleRow('AnAn'), googleRow('Cosa')])
    const call = within(card).getAllByRole('link').find(a => (a.getAttribute('href') ?? '').startsWith('tel:'))
    expect(call, 'a place with a phone number offers a call').toBeTruthy()
    expect(call!.getAttribute('href')).toBe('tel:02839307627')
    // A dialler is not a web page: it must not be opened in a new tab.
    expect(call!.getAttribute('target')).toBeNull()
  })

  it('🚨 renders NO call action when the row states no phone', () => {
    const [card] = renderFromTool([googleRow('AnAn', { phone: undefined }), googleRow('Cosa')])
    const tel = within(card).getAllByRole('link').filter(a => (a.getAttribute('href') ?? '').startsWith('tel:'))
    expect(tel).toHaveLength(0)
  })

  it('renders no website action when the row states none', () => {
    const [card] = renderFromTool([googleRow('AnAn', { website_uri: undefined }), googleRow('Cosa')])
    const hrefs = within(card).getAllByRole('link').map(a => a.getAttribute('href') ?? '')
    expect(hrefs.some(h => h.includes('anan.vn'))).toBe(false)
    // …and the ones it does state are still there.
    expect(hrefs.some(h => h.includes('maps'))).toBe(true)
  })

  it('A3.3 / A3.6 (2026-09-20): a platform SEARCH for the name is NOT an order action — only the venue\'s own page is', () => {
    // Superseded here: "a named food place always has order links". The owner's rule is the
    // deepest merchant page or nothing, so a row that carries only the platforms' search links
    // renders no order button, and the venue's own ShopeeFood page renders one, direct.
    const recs = placeRecommendations(toolResult([googleRow('AnAn', { order_links: undefined }), googleRow('Cosa')]), 'Quận 1')
    expect(buildPlacesLiveView(recs)!.items[0].actions.filter(a => a.kind === 'order')).toEqual([])
    const own = placeRecommendations(toolResult([googleRow('AnAn', { order_search_results: [{ title: 'AnAn - ShopeeFood', link: 'https://shopeefood.vn/ho-chi-minh/anan-quan-1', snippet: '', evidence_scope: 'entity', evidence_about: 'AnAn' }] }), googleRow('Cosa')]), 'Quận 1')
    const order = buildPlacesLiveView(own)!.items[0].actions.filter(a => a.kind === 'order')
    expect(order.map(a => [a.url, a.urlKind])).toEqual([['https://shopeefood.vn/ho-chi-minh/anan-quan-1', 'direct']])
  })

  it('🚨 renders a TikTok review only when the attribution is real', () => {
    const attributed = googleRow('AnAn', {
      tiktok_review_url: 'https://www.tiktok.com/@an/video/123',
      has_tiktok_review: true,
    })
    const [withReview] = renderFromTool([attributed, googleRow('Cosa')])
    expect(within(withReview).getAllByRole('link').some(a => (a.getAttribute('href') ?? '').includes('tiktok.com/@an/video/123'))).toBe(true)

    cleanup()
    // The same place with attribution NOT established: the URL is not carried,
    // so nothing may present a review link for it.
    const [without] = renderFromTool([googleRow('AnAn', { has_tiktok_review: false }), googleRow('Cosa')])
    expect(within(without).getAllByRole('link').some(a => (a.getAttribute('href') ?? '').includes('/video/'))).toBe(false)
  })

  it('shows the map exploration block for the provider search URL, once', () => {
    renderFromTool([googleRow('AnAn'), googleRow('Cosa')])
    const map = screen.getAllByTestId('place-map-explore')
    expect(map).toHaveLength(1)
    expect(map[0].getAttribute('href')).toBe('https://www.google.com/maps/search/cafe+quan+1')
  })

  it('🚨 presents each merchant exactly once', () => {
    const cards = renderFromTool([googleRow('AnAn'), googleRow('Cosa'), googleRow('HAN')])
    const names = cards.map(c => within(c).getByRole('heading').textContent)
    expect(names).toEqual(['AnAn', 'Cosa', 'HAN'])
    expect(new Set(names).size).toBe(3)
  })
})
