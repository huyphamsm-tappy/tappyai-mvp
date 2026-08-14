import { describe, it, expect } from 'vitest'
import {
  cacheKeyPart, placesCacheKey, weatherCacheKey, goldCacheKey, newsCacheKey,
  webSearchCacheKey, productsCacheKey, flightsCacheKey, hotelsCacheKey, transportCacheKey,
} from './cacheKeys'

// Cache keys decide whether two requests share an upstream result. Two rules:
//   same semantic request  -> same key   (or we pay twice for one answer)
//   different request      -> different key (or a user gets someone else's answer)
//
// Deliberately NOT normalized: Vietnamese diacritics. "quán ăn" and "quan an"
// look interchangeable, but the query is passed VERBATIM to Google Places as
// textQuery, so the two are genuinely different upstream calls — and stripping
// tone marks merges distinct Vietnamese words (mắt/mất/mát -> mat). Merging them
// would be a correctness bug dressed up as a cache win.

describe('cacheKeyPart', () => {
  it('treats byte-different but identical text as one key (NFC)', () => {
    // "ế" precomposed vs e + combining circumflex + combining acute.
    const precomposed = 'phế'
    const decomposed = 'phế'
    expect(precomposed).not.toBe(decomposed)          // different bytes…
    expect(cacheKeyPart(precomposed)).toBe(cacheKeyPart(decomposed)) // …one key
  })

  it('collapses whitespace runs and trims', () => {
    expect(cacheKeyPart('  quán   ăn  ngon ')).toBe('quán ăn ngon')
    expect(cacheKeyPart('quán\tăn\nngon')).toBe('quán ăn ngon')
  })

  it('lowercases', () => {
    expect(cacheKeyPart('Quán Ăn NGON')).toBe(cacheKeyPart('quán ăn ngon'))
  })

  it('survives null and undefined', () => {
    expect(cacheKeyPart(null)).toBe('')
    expect(cacheKeyPart(undefined)).toBe('')
    expect(cacheKeyPart('')).toBe('')
  })

  it('does NOT strip diacritics — that would merge different queries', () => {
    expect(cacheKeyPart('quán ăn')).not.toBe(cacheKeyPart('quan an'))
  })
})

describe('weatherCacheKey — keyed on the RESOLVED city, not the raw input', () => {
  // wttr.in is called with cityMap[normalizeVN(location)] || location, so every
  // spelling that resolves to "Hanoi" produces one identical upstream call and
  // must share one entry. Before this, "Hà Nội" / "ha noi" / "HN" were 3 keys
  // for 1 result.
  it('every spelling of Hanoi shares a key', () => {
    const k = weatherCacheKey('Hanoi', 'vi')
    for (const spelling of ['Hà Nội', 'ha noi', 'HN', 'hanoi', '  Hà Nội  ']) {
      expect(weatherCacheKey(spelling, 'vi'), spelling).toBe(k)
    }
  })

  it('genuinely different cities stay apart', () => {
    expect(weatherCacheKey('Hà Nội', 'vi')).not.toBe(weatherCacheKey('Đà Nẵng', 'vi'))
    expect(weatherCacheKey('Sài Gòn', 'vi')).not.toBe(weatherCacheKey('Đà Lạt', 'vi'))
  })

  it('an unmapped location falls through to itself, still normalized', () => {
    expect(weatherCacheKey('Buôn Ma Thuột', 'vi')).toBe(weatherCacheKey('  buôn ma thuột ', 'vi'))
    expect(weatherCacheKey('Buôn Ma Thuột', 'vi')).not.toBe(weatherCacheKey('Pleiku', 'vi'))
  })

  it('keeps languages apart', () => {
    expect(weatherCacheKey('Hà Nội', 'vi')).not.toBe(weatherCacheKey('Hà Nội', 'en'))
  })
})

describe('goldCacheKey — the query does not affect the result, so it is not in the key', () => {
  // getGoldPrice fetches one fixed URL and filters a fixed code list; `query` is
  // never read. Keying on it split one answer across every phrasing.
  it('all phrasings share a key', () => {
    const k = goldCacheKey('vi')
    expect(goldCacheKey('vi')).toBe(k)
  })

  it('still keeps languages apart', () => {
    expect(goldCacheKey('vi')).not.toBe(goldCacheKey('en'))
  })
})

describe('other tool keys — normalized, but semantics preserved', () => {
  it('places: whitespace and case normalize, everything else separates', () => {
    const base = placesCacheKey('Quán ăn ngon', 'Quận 1', 'restaurant', null, 'vi')
    expect(placesCacheKey('  quán   ăn ngon ', 'quận 1', 'restaurant', null, 'vi')).toBe(base)
    // each component still discriminates
    expect(placesCacheKey('Quán ăn ngon', 'Quận 3', 'restaurant', null, 'vi')).not.toBe(base)
    expect(placesCacheKey('Quán ăn ngon', 'Quận 1', 'cafe', null, 'vi')).not.toBe(base)
    expect(placesCacheKey('Quán ăn ngon', 'Quận 1', 'restaurant', null, 'en')).not.toBe(base)
    expect(placesCacheKey('Quán cà phê', 'Quận 1', 'restaurant', null, 'vi')).not.toBe(base)
  })

  it('places: GPS still discriminates, at the same precision as before', () => {
    const a = placesCacheKey('cafe', '', undefined, { lat: 10.7769, lng: 106.7009 }, 'vi')
    const b = placesCacheKey('cafe', '', undefined, { lat: 10.7771, lng: 106.7011 }, 'vi') // same 2dp
    const c = placesCacheKey('cafe', '', undefined, { lat: 21.0285, lng: 105.8542 }, 'vi') // Hanoi
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(placesCacheKey('cafe', '', undefined, null, 'vi')).not.toBe(a)
  })

  it('hotels: budget and dates still discriminate', () => {
    const base = hotelsCacheKey('Đà Nẵng', '2026-09-01', '2026-09-03', 2_000_000, 'vi')
    expect(hotelsCacheKey('  đà nẵng ', '2026-09-01', '2026-09-03', 2_000_000, 'vi')).toBe(base)
    expect(hotelsCacheKey('Đà Nẵng', '2026-09-02', '2026-09-03', 2_000_000, 'vi')).not.toBe(base)
    expect(hotelsCacheKey('Đà Nẵng', '2026-09-01', '2026-09-03', 1_000_000, 'vi')).not.toBe(base)
    expect(hotelsCacheKey('Đà Nẵng', '2026-09-01', '2026-09-03', undefined, 'vi')).not.toBe(base)
  })

  it('flights and transport keep direction and mode', () => {
    expect(flightsCacheKey('Hà Nội', 'TP HCM', 'vi')).not.toBe(flightsCacheKey('TP HCM', 'Hà Nội', 'vi'))
    expect(transportCacheKey('Hà Nội', 'Hải Phòng', 'taxi', 'vi'))
      .not.toBe(transportCacheKey('Hà Nội', 'Hải Phòng', 'intercity', 'vi'))
    expect(transportCacheKey('Hà Nội', 'Hải Phòng', undefined, 'vi'))
      .toBe(transportCacheKey(' hà nội ', 'hải phòng', undefined, 'vi'))
  })

  it('news / websearch / products normalize but keep language apart', () => {
    expect(newsCacheKey('  Tin Tức  mới nhất ', 'vi')).toBe(newsCacheKey('tin tức mới nhất', 'vi'))
    expect(webSearchCacheKey('Tỷ giá  USD', 'vi')).toBe(webSearchCacheKey('tỷ giá usd', 'vi'))
    expect(productsCacheKey('AirPods  Pro', 'en')).toBe(productsCacheKey('airpods pro', 'en'))
    for (const k of [newsCacheKey, webSearchCacheKey, productsCacheKey]) {
      expect(k('x', 'vi')).not.toBe(k('x', 'en'))
    }
  })

  it('no two different tools can ever collide', () => {
    const keys = [
      placesCacheKey('x', '', undefined, null, 'vi'),
      newsCacheKey('x', 'vi'),
      webSearchCacheKey('x', 'vi'),
      productsCacheKey('x', 'vi'),
      flightsCacheKey('x', 'y', 'vi'),
      hotelsCacheKey('x', '', '', undefined, 'vi'),
      transportCacheKey('x', 'y', undefined, 'vi'),
      weatherCacheKey('x', 'vi'),
      goldCacheKey('vi'),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})
