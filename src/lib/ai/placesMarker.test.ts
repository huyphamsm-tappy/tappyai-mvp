import { describe, it, expect } from 'vitest'
import { renderPlacesMarker, PLACES_MARKER_OPEN, PLACES_MARKER_CLOSE } from './streamEnrichment'
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

describe('renderPlacesMarker — the [TAPPY_PLACES] block', () => {
  const { enrichment } = carve([TONKIN, ROOFTOP])

  it('serializes exactly the contract shape', () => {
    const marker = renderPlacesMarker(enrichment, PROSE)
    expect(marker.startsWith('\n\n' + PLACES_MARKER_OPEN)).toBe(true)
    expect(marker.endsWith(PLACES_MARKER_CLOSE)).toBe(true)

    const json = marker.slice(marker.indexOf(PLACES_MARKER_OPEN) + PLACES_MARKER_OPEN.length, marker.lastIndexOf(PLACES_MARKER_CLOSE))
    const payload = JSON.parse(json)
    expect(payload.v).toBe(1)
    expect(Array.isArray(payload.places)).toBe(true)
    expect(payload.places).toHaveLength(2)
  })

  it('states each place with its own values and no invented ones', () => {
    const payload = JSON.parse(
      renderPlacesMarker(enrichment, PROSE).replace(/^\n\n/, '').replace(PLACES_MARKER_OPEN, '').replace(PLACES_MARKER_CLOSE, ''),
    )
    const [first, second] = payload.places

    expect(first).toEqual({
      placeId: 'p-tonkin',
      name: 'Tonkin Specialty Coffee',
      rank: 1,
      photo: 'https://img.example/tonkin.jpg',
      address: '91 Lý Tự Trọng, Bến Thành, Quận 1',
      rating: 4.8,
      reviewCount: 4676,
    })
    // The OSM row states different facts — and no rating key at all, rather than a null one.
    expect(second.name).toBe('1991 Rooftop Coffee')
    expect(second.rank).toBe(2)
    expect(second.hours).toBe('07:30-22:00')
    expect(second.distanceKm).toBe(1.2)
    expect(second.attributes).toEqual(['coffee_shop', 'cake'])
    expect('rating' in second).toBe(false)
    expect('reviewCount' in second).toBe(false)
    expect('placeId' in second).toBe(false)
  })

  it('never carries actions — [CTA_BUTTONS] stays the only action channel', () => {
    const marker = renderPlacesMarker(enrichment, PROSE)
    expect(marker).not.toContain('actions')
    expect(marker).not.toContain('maps_link')
    expect(marker).not.toContain('order_links')
    expect(marker).not.toContain('openNow')
  })

  it('ranks by where the reply names them, not by tool order', () => {
    const reversed = 'Trước hết **1991 Rooftop Coffee**, sau đó **Tonkin Specialty Coffee**.'
    const payload = JSON.parse(
      renderPlacesMarker(enrichment, reversed).replace(/^\n\n/, '').replace(PLACES_MARKER_OPEN, '').replace(PLACES_MARKER_CLOSE, ''),
    )
    expect(payload.places.map((p: { name: string }) => p.name)).toEqual([
      '1991 Rooftop Coffee',
      'Tonkin Specialty Coffee',
    ])
  })

  it('omits a place the reply never named', () => {
    const onlyOne = 'Mình gợi ý **Tonkin Specialty Coffee** nhé.'
    const payload = JSON.parse(
      renderPlacesMarker(enrichment, onlyOne).replace(/^\n\n/, '').replace(PLACES_MARKER_OPEN, '').replace(PLACES_MARKER_CLOSE, ''),
    )
    expect(payload.places).toHaveLength(1)
    expect(payload.places[0].name).toBe('Tonkin Specialty Coffee')
  })

  it('emits nothing when there are no places, no names, or no prose', () => {
    expect(renderPlacesMarker([], PROSE)).toBe('')
    expect(renderPlacesMarker(enrichment, '')).toBe('')
    expect(renderPlacesMarker([{ name: '   ' }], PROSE)).toBe('')
    // Named nowhere in the reply → no block at all, rather than an empty one.
    expect(renderPlacesMarker(enrichment, 'Không nhắc tên quán nào cả.')).toBe('')
  })
})
