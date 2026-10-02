import { describe, it, expect } from 'vitest'
import { placesGroundedInProse } from './streamEnrichment'
import { splitToolResult } from './toolResultSplit'

// ── [TAPPY_PLACES] — the shared place contract ───────────────────────────────
//
// One block serves food, spa and entertainment venues: the pipeline resolves all three through
// searchPlaces, so they are the same object. These tests pin that the block states only what the
// provider stated — rating and review count as NUMBERS, never re-parsed from the localized
// `google_rating` sentence — and that each place keeps its own photo and identity.

/** The shape searchPlaces (Google branch) produces, after the rating change. */
const TONKIN = {
  place_id: 'p-tonkin',
  name: 'Tonkin Specialty Coffee',
  address: '91 Lý Tự Trọng, Bến Thành, Quận 1',
  google_rating: '4,8 sao (4.676 đánh giá)',
  rating: 4.8,
  review_count: 4676,
  maps_link: 'https://maps.google.com/?q=place_id:p-tonkin',
  website_uri: 'https://tonkin.example',
  photo_url: 'https://img.example/tonkin.jpg',
  order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/tonkin' }],
}

/** The OSM branch states different facts: hours, distance and cuisine, but no rating. */
const ROOFTOP = {
  name: '1991 Rooftop Coffee',
  address: '37/4 Đinh Công Tráng, Tân Định',
  opening_hours: '07:30-22:00',
  distance_km: 1.2,
  cuisine: 'coffee_shop, cake',
  photo_url: 'https://img.example/rooftop.jpg',
}

const PROSE = 'Mình gợi ý **Tonkin Specialty Coffee** và **1991 Rooftop Coffee** nhé.'

function carve(results: unknown[]) {
  return splitToolResult('search_places', { source: 'Google Maps', results })
}

describe('splitToolResult — place facts ride along without leaving the model payload', () => {
  it('carries rating and review count as numbers', () => {
    const { enrichment } = carve([TONKIN])
    expect(enrichment[0].rating).toBe(4.8)
    expect(enrichment[0].review_count).toBe(4676)
  })

  it('keeps the localized google_rating string for existing consumers', () => {
    const { model } = carve([TONKIN])
    const first = (model as { results: Record<string, unknown>[] }).results[0]
    expect(first.google_rating).toBe('4,8 sao (4.676 đánh giá)')
    // The numbers stay model-facing too — nothing was destructured away from it.
    expect(first.rating).toBe(4.8)
    expect(first.review_count).toBe(4676)
  })

  it('carries address, hours, distance and cuisine attributes when the row states them', () => {
    const { enrichment } = carve([ROOFTOP])
    expect(enrichment[0].address).toBe('37/4 Đinh Công Tráng, Tân Định')
    expect(enrichment[0].hours).toBe('07:30-22:00')
    expect(enrichment[0].distance_km).toBe(1.2)
    expect(enrichment[0].attributes).toEqual(['coffee_shop', 'cake'])
  })

  it('leaves unstated facts undefined rather than defaulting them', () => {
    const { enrichment } = carve([ROOFTOP])
    expect(enrichment[0].rating).toBeUndefined()
    expect(enrichment[0].review_count).toBeUndefined()
  })

  it('keeps each place with its own identity and photo', () => {
    const { enrichment } = carve([TONKIN, ROOFTOP])
    expect(enrichment).toHaveLength(2)
    expect(enrichment[0].place_id).toBe('p-tonkin')
    expect(enrichment[0].photo_url).toBe('https://img.example/tonkin.jpg')
    expect(enrichment[1].place_id).toBeUndefined()
    expect(enrichment[1].photo_url).toBe('https://img.example/rooftop.jpg')
  })

  it('leaves the existing CTA/order links untouched', () => {
    const { enrichment } = carve([TONKIN])
    expect(enrichment[0].order_links).toEqual([{ name: 'ShopeeFood', url: 'https://shopeefood.vn/tonkin' }])
  })
})

/**
 * 🔄 THIS SUITE FOLLOWED THE SERIALIZER OUT OF THIS MODULE.
 *
 * It used to assert a second `[TAPPY_PLACES]` payload (`{ v: 1, places: [...] }`) rendered
 * here. `lib/recommendation/marker.ts` owns that wire contract — it has the client parser,
 * the persistence policy and the three-platform fixture governance — so the serializer is
 * there and only there, and its shape is asserted by `recommendation/marker.test.ts`.
 *
 * What was NOT duplicated, and is what this file now pins, is WHICH places may reach a card
 * at all: the provider must have ranked against the user's words, and the reply must already
 * name the place. Those two conditions were the reason this suite existed.
 */
describe('placesGroundedInProse — which places may reach a durable card', () => {
  const { enrichment } = carve([TONKIN, ROOFTOP])

  it('keeps the places the reply names, in the reply\'s own order', () => {
    const carded = placesGroundedInProse(enrichment, PROSE)
    expect(carded.map(p => p.name)).toEqual(['Tonkin Specialty Coffee', '1991 Rooftop Coffee'])
  })

  it('returns the rows untouched — no field is added, renamed or invented here', () => {
    const [first] = placesGroundedInProse(enrichment, PROSE)
    // Identity, not a copy: whatever the tool stated is exactly what the serializer receives.
    expect(first).toBe(enrichment[0])
    expect(first.place_id).toBe('p-tonkin')
    expect(first.rating).toBe(4.8)
    expect(first.review_count).toBe(4676)
    // The OSM row states different facts — and no rating key at all, rather than a null one.
    const second = placesGroundedInProse(enrichment, PROSE)[1]
    expect(second.hours).toBe('07:30-22:00')
    expect(second.distance_km).toBe(1.2)
    expect(second.attributes).toEqual(['coffee_shop', 'cake'])
    expect(second.rating).toBeUndefined()
    expect(second.review_count).toBeUndefined()
    expect(second.place_id).toBeUndefined()
  })

  it('ranks by where the reply names them, not by tool order', () => {
    const reversed = 'Trước hết **1991 Rooftop Coffee**, sau đó **Tonkin Specialty Coffee**.'
    expect(placesGroundedInProse(enrichment, reversed).map(p => p.name)).toEqual([
      '1991 Rooftop Coffee',
      'Tonkin Specialty Coffee',
    ])
  })

  it('omits a place the reply never named', () => {
    const onlyOne = 'Mình gợi ý **Tonkin Specialty Coffee** nhé.'
    const carded = placesGroundedInProse(enrichment, onlyOne)
    expect(carded).toHaveLength(1)
    expect(carded[0].name).toBe('Tonkin Specialty Coffee')
  })

  it('grounds nothing when there are no places, no names, or no prose', () => {
    expect(placesGroundedInProse([], PROSE)).toEqual([])
    expect(placesGroundedInProse(enrichment, '')).toEqual([])
    expect(placesGroundedInProse([{ name: '   ' }], PROSE)).toEqual([])
    // Named nowhere in the reply → nothing earns a card, and the caller emits no block at all.
    expect(placesGroundedInProse(enrichment, 'Không nhắc tên quán nào cả.')).toEqual([])
  })
})
