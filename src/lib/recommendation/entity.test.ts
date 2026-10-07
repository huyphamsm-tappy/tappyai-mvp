import { describe, it, expect } from 'vitest'
import { buildPlaceEntity, buildProductEntity, buildStayEntity, buildImages, sourceOf } from './buildEntity'
import { isKnown } from './entity'
import { UNKNOWN } from '@/lib/ai/consultative/normalizedEvidence'

// ── PART 3 — canonical entity normalization ─────────────────────────────────
//
// The contract these tests defend: ONE entity shape for five domains, every
// factual field traceable to a deterministic source, and absence modelled rather
// than defaulted. The last one is the easiest to lose — a `?? 0` or a `|| ''`
// anywhere below turns "we don't know" into a claim.

const GOOGLE_ROW = {
  place_id: 'ChIJ_test',
  name: 'The Log Coffee',
  address: '123 Lê Lợi, Quận 1',
  google_rating: '4.5⭐ (2.847 đánh giá Google Maps)',
  rating_value: 4.5,
  rating_count: 2847,
  maps_link: 'https://maps.google.com/?cid=1',
  website_uri: 'https://thelog.example',
  opening_hours: 'Thứ Hai: 07:00–22:00; Thứ Ba: 07:00–22:00',
  open_now: true,
  phone: '+84 28 1234 5678',
  price_level: 2,
  lat: 10.7769,
  lng: 106.7009,
  place_types: ['cafe', 'food'],
  photo_names: ['places/ChIJ_test/photos/AeZ1'],
}

describe('a Google place becomes one canonical entity', () => {
  const e = buildPlaceEntity(GOOGLE_ROW, { domain: 'food', source: 'google_places' })

  it('carries a stable, source-scoped id', () => {
    expect(e.id).toBe('place:google:ChIJ_test')
  })

  it('is versioned', () => {
    expect(e.v).toBe(1)
  })

  it('is a place in the food domain, not a food-shaped schema', () => {
    expect(e.kind).toBe('place')
    expect(e.domain).toBe('food')
  })

  it('reads the rating as a NUMBER, not out of the formatted string', () => {
    // The formatted string is still on the row; the entity must not need it.
    expect(e.quality.rating.value).toBe(4.5)
    expect(e.quality.ratingCount.value).toBe(2847)
    expect(e.quality.rating.evidence_type).toBe('FACT')
  })

  it('carries hours AND rating together — the disjoint-source problem, gone', () => {
    // 🔑 This single assertion is the whole point of the field-mask work. Before
    // it, hours came only from the OSM fallback and rating only from Google, so
    // no entity could ever hold both.
    expect(isKnown(e.quality.rating)).toBe(true)
    expect(isKnown(e.availability.openingHours)).toBe(true)
  })

  it('keeps coordinates instead of computing and discarding them', () => {
    expect(e.location.coordinates).toEqual({ lat: 10.7769, lng: 106.7009 })
  })

  it('distinguishes open-now from unknown', () => {
    expect(e.availability.openNow).toBe(true)
    const noHours = buildPlaceEntity({ ...GOOGLE_ROW, open_now: undefined }, { domain: 'food', source: 'google_places' })
    // 🚨 null, never false. "Closed" and "we have no hours" are different answers.
    expect(noHours.availability.openNow).toBeNull()
  })

  it('records per-field provenance, because fields can come from different providers', () => {
    expect(e.provenance['quality.rating']).toBe('google_places')
    expect(e.provenance['availability.openingHours']).toBe('google_places')
  })
})

describe('absence is modelled, never defaulted', () => {
  const bare = buildPlaceEntity({ name: 'Quán Nhỏ' }, { domain: 'food', source: 'osm' })

  it('an unstated rating is UNKNOWN, not 0', () => {
    expect(bare.quality.rating.value).toBe(UNKNOWN)
    expect(bare.quality.rating.evidence_type).toBe('UNKNOWN')
    expect(isKnown(bare.quality.rating)).toBe(false)
  })

  it('unstated hours are UNKNOWN, not an empty string', () => {
    expect(bare.availability.openingHours.value).toBe(UNKNOWN)
  })

  it('unstated attributes are absent keys, not false', () => {
    expect(bare.attributes.wifi).toBeUndefined()
    expect('wifi' in bare.attributes).toBe(false)
  })

  it('no coordinates means null, not 0,0', () => {
    expect(bare.location.coordinates).toBeNull()
  })

  it('there is no description field for prose to leak into', () => {
    // No approved source produces one; `editorialSummary` is Option B and unapproved.
    expect('description' in bare).toBe(false)
  })
})

describe('an OSM place is the same shape with different fields', () => {
  const e = buildPlaceEntity(
    { name: 'Quán Cà Phê Cũ', address: '12 Nguyễn Huệ', opening_hours: 'Mo-Su 07:00-22:00', phone: '+84 28 999', wifi: true, cuisine: 'coffee_shop, bakery', lat: 10.77, lng: 106.7 },
    { domain: 'food', source: 'osm' },
  )

  it('gets a coordinate-keyed id, since OSM emits no element id', () => {
    expect(e.id).toBe('place:osm:10.77000,106.70000')
  })

  it('has hours but no rating — and says so honestly', () => {
    expect(isKnown(e.availability.openingHours)).toBe(true)
    expect(isKnown(e.quality.rating)).toBe(false)
  })

  it('attributes the fields to OSM, not to Google', () => {
    expect(e.provenance['availability.openingHours']).toBe('osm')
  })

  it('splits cuisine into a category list', () => {
    expect(e.attributes.categories).toEqual(['coffee_shop', 'bakery'])
  })
})

describe('sourceOf reads the envelope rather than sniffing the row shape', () => {
  it('recognises OSM', () => expect(sourceOf({ source: 'OpenStreetMap' })).toBe('osm'))
  it('defaults to Google', () => expect(sourceOf({ source: 'Google Maps' })).toBe('google_places'))
})

describe('a product is the same entity, different kind', () => {
  const e = buildProductEntity({
    title: 'MacBook Air M2 13" 16GB 512GB',
    link: 'https://cellphones.example/macbook-air-m2',
    price: '24.990.000₫',
    price_vnd: 24990000,
    source: 'CellphoneS',
    rating: 4.8,
    rating_count: 312,
    product_id: 'p-1',
    photo_url: 'https://cdn.example/mba.jpg',
  })

  it('is a product in the shopping domain', () => {
    expect(e.kind).toBe('product')
    expect(e.domain).toBe('shopping')
  })

  it('carries the only FACT-grade price in the system', () => {
    expect(e.pricing.price.value).toBe(24990000)
    expect(e.pricing.price.evidence_type).toBe('FACT')
    expect(e.pricing.price.source_id).toBe('serper_shopping')
  })

  it('holds its offer in the shopping extension, not on the core', () => {
    expect((e.ext as { offers: unknown[] }).offers).toHaveLength(1)
  })

  it('has no location — a listing is not a venue', () => {
    expect(e.location.coordinates).toBeNull()
    expect(e.location.address).toBe(UNKNOWN)
  })
})

describe('a hotel is a stay, and does not claim a rating it never got', () => {
  const e = buildStayEntity(
    { title: 'Hotel Continental Saigon - Ho Chi Minh City - Booking.com', photo_url: 'https://cdn.example/h.jpg', stars: '4' },
    { bookingLink: 'https://www.booking.com/searchresults.html?ss=Hotel+Continental' },
  )

  it('recovers the name from the snippet title', () => {
    expect(e.identity.name).toBe('Hotel Continental Saigon')
  })

  it('leaves guest rating UNKNOWN — snippets carry it, we do not extract it', () => {
    expect(isKnown(e.quality.rating)).toBe(false)
  })

  it('keeps the star class, which OSM does supply', () => {
    expect(e.quality.stars).toBe(4)
  })
})

describe('image normalization', () => {
  it('dedupes and prefers the stable source as primary', () => {
    const imgs = buildImages({ photo_url: 'https://a.example/1.jpg', photo_urls: ['https://a.example/1.jpg', 'https://a.example/2.jpg'] }, 'provider')
    expect(imgs.gallery.map(i => i.url)).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg'])
    expect(imgs.primary?.stability).toBe('stable')
  })

  it('marks a Google photo volatile — those URLs rot', () => {
    expect(buildImages({ photo_url: 'https://x.example/g.jpg' }, 'google_photo').primary?.stability).toBe('volatile')
  })

  it('drops anything that is not an http URL', () => {
    expect(buildImages({ photo_url: 'javascript:alert(1)' }, 'provider').primary).toBeNull()
  })

  it('an entity with no photo has a null primary, not a placeholder string', () => {
    expect(buildImages({}, 'serper_images')).toEqual({ primary: null, gallery: [] })
  })
})
