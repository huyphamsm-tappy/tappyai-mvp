import { describe, it, expect } from 'vitest'
import { normalizePlaces, normalizeHotels, type Candidate } from './candidate'

// ── Normalization (Phase 2 §4 "Input") ──────────────────────────────────────
//
// The single rule these tests exist to defend:
//
//   A field absent from the tool result is `undefined` — never defaulted, never
//   inferred, never parsed out of a title or a snippet.
//
// C3-B.8 measured a 20% false-accept rate the moment prices were parsed from
// titles. That lesson is binding here.

/** A Google Places result, exactly as searchPlaces builds it. */
const GOOGLE_RESULT = {
  source: 'Google Maps',
  count: 2,
  results: [
    {
      place_id: 'ChIJaaa',
      name: 'Phở Hòa Pasteur',
      address: '260C Pasteur, Quận 3',
      google_rating: '4.5⭐ (2,847 đánh giá Google Maps)',
      maps_link: 'https://www.google.com/maps/place/?q=place_id:ChIJaaa',
      website_uri: 'https://phohoa.vn',
    },
    {
      place_id: 'ChIJbbb',
      name: 'Quán Bún Bò Gánh',
      address: '110 Lý Chính Thắng',
      google_rating: null,
      maps_link: 'https://www.google.com/maps/place/?q=place_id:ChIJbbb',
    },
  ],
}

/** An OSM result, exactly as searchPlacesOSM builds it. */
const OSM_RESULT = {
  source: 'OpenStreetMap',
  count: 2,
  results: [
    {
      name: 'The Workshop Coffee',
      address: '27 Ngô Đức Kế',
      phone: null,
      maps_link: 'https://www.google.com/maps?q=10.77,106.70',
      cuisine: 'coffee shop',
      opening_hours: 'Mo-Su 08:00-22:00',
      wifi: true,
      outdoor_seating: true,
      distance_km: 1.2,
    },
    {
      name: 'Cafe Vắng',
      address: '5 Nguyễn Huệ',
      phone: null,
      maps_link: 'https://www.google.com/maps?q=10.78,106.71',
      vegetarian: true,
      distance_km: 3.4,
    },
  ],
}

describe('normalizePlaces — Google Maps shape', () => {
  const c = normalizePlaces(GOOGLE_RESULT)

  it('produces one candidate per result', () => {
    expect(c).toHaveLength(2)
  })

  it('parses the rating out of OUR OWN formatted string — an authoritative field', () => {
    // `google_rating` is built by messages.places.googleRating() from the API's
    // numeric `rating`/`userRatingCount`. Reading our own format back is not the
    // free-text parsing §13 forbids — it is the authoritative field, formatted.
    expect(c[0].attrs.rating).toBe(4.5)
    expect(c[0].attrs.reviewCount).toBe(2847)
  })

  it('parses the EN format too — the string differs by language', () => {
    const en = normalizePlaces({
      results: [{ place_id: 'x', name: 'A', google_rating: '4.2⭐ (1,203 Google Maps reviews)', maps_link: 'https://m/x' }],
    })
    expect(en[0].attrs.rating).toBe(4.2)
    expect(en[0].attrs.reviewCount).toBe(1203)
  })

  it('leaves rating UNDEFINED when the field is null — never 0, never a default', () => {
    expect(c[1].attrs.rating).toBeUndefined()
    expect(c[1].attrs.reviewCount).toBeUndefined()
    expect('rating' in c[1].attrs).toBe(false)
  })

  it('keeps the real provider link attached to its own candidate', () => {
    expect(c[0].link).toBe('https://www.google.com/maps/place/?q=place_id:ChIJaaa')
    expect(c[1].link).toBe('https://www.google.com/maps/place/?q=place_id:ChIJbbb')
  })

  it('carries the original record through untouched, so nothing detaches later', () => {
    expect((c[0].raw as { place_id: string }).place_id).toBe('ChIJaaa')
    expect((c[0].raw as { website_uri: string }).website_uri).toBe('https://phohoa.vn')
  })

  it('gives every candidate a stable id', () => {
    expect(c[0].id).toBe('ChIJaaa')
    expect(new Set(c.map(x => x.id)).size).toBe(2)
  })
})

describe('normalizePlaces — OpenStreetMap shape', () => {
  const c = normalizePlaces(OSM_RESULT)

  it('reads the boolean amenity tags that OSM actually supplies', () => {
    expect(c[0].attrs.wifi).toBe(true)
    expect(c[0].attrs.outdoorSeating).toBe(true)
    expect(c[1].attrs.vegetarian).toBe(true)
  })

  it('an ABSENT amenity is undefined, not false — unknown is not "no"', () => {
    // OSM omits the tag when it has no data. Reading that as `false` would let
    // a hard filter eliminate a place for lacking evidence rather than lacking
    // the feature — the exact conflation the missing-data rule forbids.
    expect(c[1].attrs.wifi).toBeUndefined()
    expect('wifi' in c[1].attrs).toBe(false)
  })

  it('reads distance and cuisine when present', () => {
    expect(c[0].attrs.distanceKm).toBe(1.2)
    expect(c[0].attrs.cuisine).toEqual(['coffee shop'])
  })

  it('splits a multi-value cuisine tag', () => {
    const multi = normalizePlaces({ results: [{ name: 'X', maps_link: 'https://m/x', cuisine: 'japanese, sushi' }] })
    expect(multi[0].attrs.cuisine).toEqual(['japanese', 'sushi'])
  })

  it('never invents a price — OSM carries none', () => {
    for (const x of c) expect(x.attrs.priceVnd).toBeUndefined()
  })
})

describe('normalizeHotels', () => {
  const HOTEL_RESULT = {
    search_results: [
      { title: 'TTR Skypool Boutique Hotel, Da Nang', link: 'https://www.booking.com/hotel/vn/ttr-skypool.html', snippet: 'Từ 393.582 VND/đêm' },
      { title: 'Cheap hotels in Da Nang', link: 'https://www.booking.com/searchresults.html?ss=Da+Nang', snippet: 'Find deals' },
    ],
    hotel_list: [
      { name: 'AOA Da Nang Beach Hotel', address: '12 Võ Nguyên Giáp', maps_link: 'https://www.google.com/maps?q=16.05,108.24', stars: '4', distance_km: 0.3 },
    ],
    booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang',
  }
  const c = normalizeHotels(HOTEL_RESULT)

  it('normalizes both search_results and hotel_list into one candidate list', () => {
    expect(c.length).toBe(3)
  })

  it('marks a specific /hotel/ page as a direct page, and a search page as not', () => {
    const direct = c.find(x => x.link?.includes('ttr-skypool'))!
    const searchPage = c.find(x => x.link?.includes('searchresults'))!
    expect(direct.attrs.directPage).toBe(true)
    expect(searchPage.attrs.directPage).toBe(false)
  })

  it('reads OSM stars as a NUMBER when present', () => {
    const osm = c.find(x => x.name.includes('AOA'))!
    expect(osm.attrs.stars).toBe(4)
    expect(osm.attrs.distanceKm).toBe(0.3)
  })

  it('does NOT parse the price out of the snippet, even though one is visible', () => {
    // "Từ 393.582 VND/đêm" is right there in the snippet. Reading it as a
    // structured price would make it rankable AND quotable, and no provider
    // contract says that number is the room rate for the user's dates.
    // applyBudgetFilter already uses snippet text for the HARD budget filter —
    // that is shipped behaviour and stays where it is. It must not become a score.
    const direct = c.find(x => x.link?.includes('ttr-skypool'))!
    expect(direct.attrs.priceVnd).toBeUndefined()
  })

  it('keeps each hotel bound to its own link', () => {
    const direct = c.find(x => x.name.includes('TTR'))!
    expect(direct.link).toBe('https://www.booking.com/hotel/vn/ttr-skypool.html')
  })
})

describe('normalization is total and never throws', () => {
  it('handles empty, missing and malformed tool results', () => {
    for (const bad of [null, undefined, {}, { results: null }, { results: [] }, { results: [{}] }, 'nonsense', 42]) {
      expect(() => normalizePlaces(bad)).not.toThrow()
      expect(() => normalizeHotels(bad)).not.toThrow()
    }
  })

  it('drops entries with no usable name rather than emitting a nameless candidate', () => {
    const c = normalizePlaces({ results: [{ name: '', maps_link: 'https://m/x' }, { name: 'Real', maps_link: 'https://m/y' }] })
    expect(c.map((x: Candidate) => x.name)).toEqual(['Real'])
  })

  it('is deterministic', () => {
    expect(normalizePlaces(OSM_RESULT)).toEqual(normalizePlaces(OSM_RESULT))
  })
})
