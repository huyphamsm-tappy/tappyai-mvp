import { describe, it, expect } from 'vitest'
import { buildPlaceEntity, buildStayEntity, sourceOf, SERPER_PLACES_SOURCE, type PlaceRow, type StayRow } from './buildEntity'
import { isKnown } from './entity'

// ─────────────────────────────────────────────────────────────────────────────
// PROVENANCE FOR THE NEW SOURCE.
//
// Serper sells two products this pipeline consumes, and they carry different
// authority: `/search` returns WEB PAGES whose numbers live in prose, `/maps`
// returns STRUCTURED RECORDS whose numbers are the provider's own fields.
// Collapsing them would either understate real structured data or — far worse —
// let a page title inherit provider authority. These tests hold them apart.
//
// The one value on a `/maps` row that is NOT the provider's assertion is
// `open_now`: `/maps` publishes a weekly SCHEDULE and we derive "open now" from
// it. That derivation is ours and must be recorded as ours.
// ─────────────────────────────────────────────────────────────────────────────

const MAPS_ROW: PlaceRow = {
  name: 'Bún bò Huế - Bến Ngự',
  address: '585 Huỳnh Tấn Phát, Quận 7, Hồ Chí Minh',
  rating_value: 4.4,
  rating_count: 589,
  phone: '+84 917 607 088',
  opening_hours: '06:00–20:00',
  open_now: true,
  price_range_text: '1-100.000 ₫',
  place_types: ['Quán ăn nhỏ'],
  website_uri: 'https://benngu.example/',
  photo_url: 'https://lh3.googleusercontent.com/x',
  maps_link: 'https://maps.google.com/?cid=8252027741556609696',
  lat: 10.74,
  lng: 106.73,
}

const entityFrom = (row: PlaceRow, envelopeSource: unknown) =>
  buildPlaceEntity(row, { domain: 'food', source: sourceOf({ source: envelopeSource }) })

describe('sourceOf names the provider, never sniffs the row shape', () => {
  it('maps the envelope label to the id', () => {
    expect(sourceOf({ source: SERPER_PLACES_SOURCE })).toBe('serper_places')
    expect(sourceOf({ source: 'OpenStreetMap' })).toBe('osm')
    expect(sourceOf({ source: 'Google Maps' })).toBe('google_places')
  })
})

describe('a /maps field is a structured provider FACT', () => {
  const e = entityFrom(MAPS_ROW, SERPER_PLACES_SOURCE)

  it('carries rating and review count with FACT strength', () => {
    expect(e.quality.rating.value).toBe(4.4)
    expect(e.quality.rating.evidence_type).toBe('FACT')
    expect(e.quality.rating.source_type).toBe('structured_provider')
    expect(isKnown(e.quality.ratingCount)).toBe(true)
  })

  it('carries the price band as a STRING with FACT strength, not as a snippet', () => {
    expect(e.pricing.priceRangeText.value).toBe('1-100.000 ₫')
    expect(e.pricing.priceRangeText.evidence_type).toBe('FACT')
    // …and it must never be confused with the weak snippet channel.
    expect(isKnown(e.pricing.priceSignal)).toBe(false)
  })

  it('attributes name, phone, hours and coordinates to serper_places', () => {
    expect(e.provenance['identity.name']).toBe('serper_places')
    expect(e.provenance['attributes.phone']).toBe('serper_places')
    expect(e.provenance['availability.openingHours']).toBe('serper_places')
    expect(e.provenance['quality.rating']).toBe('serper_places')
  })

  /**
   * 🚨 THE ONE DERIVED VALUE. `/maps` gives a weekly schedule, not a live state —
   * unlike Google Places, whose `currentOpeningHours.openNow` is the provider's
   * own claim. Recording ours as `computed` is what stops it being presented
   * with provider authority.
   */
  it('records open_now as COMPUTED on a /maps row', () => {
    expect(e.availability.openNow).toBe(true)
    expect(e.provenance['availability.openNow']).toBe('computed')
  })

  it('…but as the PROVIDER\'s on a Google Places row, which asserts it itself', () => {
    const g = entityFrom(MAPS_ROW, 'Google Maps')
    expect(g.provenance['availability.openNow']).toBe('google_places')
  })
})

describe('a stay is judged by what the row actually is', () => {
  it('a structured /maps hotel carries serper_places and a real rating', () => {
    const e = buildStayEntity({
      name: 'M Hotel Da Nang',
      address: '286 Võ Nguyên Giáp, Đà Nẵng',
      rating_value: 4.8,
      rating_count: 2794,
      phone: '+84 236 3816 868',
      lat: 16.04,
      lng: 108.24,
    } as StayRow)
    expect(e.quality.rating.value).toBe(4.8)
    expect(e.quality.ratingCount.value).toBe(2794)
    expect(e.provenance['identity.name']).toBe('serper_places')
    expect(e.attributes.phone).toBe('+84 236 3816 868')
  })

  /**
   * 🚨 A WEB PAGE TITLE MUST NOT INHERIT STRUCTURED AUTHORITY. This is the row
   * shape that produced "Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com" as
   * an entity name — it has no rating and no coordinates, and it stays
   * `serper_search`.
   */
  it('a snippet-derived hotel stays serper_search and invents no rating', () => {
    const e = buildStayEntity({ title: 'Some Hotel - Da Nang - Booking.com', link: 'https://booking.example/h' } as StayRow)
    expect(e.provenance['identity.name']).toBe('serper_search')
    expect(isKnown(e.quality.rating)).toBe(false)
    expect(isKnown(e.quality.ratingCount)).toBe(false)
  })
})

describe('absent provider fields stay absent — nothing is defaulted', () => {
  it('a bare /maps row invents no rating, phone, hours or band', () => {
    const e = entityFrom({ name: 'Quán Trơ', maps_link: 'https://maps.google.com/?cid=1' }, SERPER_PLACES_SOURCE)
    expect(isKnown(e.quality.rating)).toBe(false)
    expect(isKnown(e.quality.ratingCount)).toBe(false)
    expect(isKnown(e.availability.openingHours)).toBe(false)
    expect(isKnown(e.pricing.priceRangeText)).toBe(false)
    expect(e.attributes.phone).toBeUndefined()
    expect(e.availability.openNow).toBeNull()
    expect(e.provenance['availability.openNow']).toBeUndefined()
  })
})
