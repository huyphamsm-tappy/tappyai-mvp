import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { searchPlaces, searchPlacesOSM, resolveSearchScope, belongsToDestination } from './food'
import { CITY_MATCH_RADIUS_KM, cityForAlias, haversineKm } from './vietnamCities'

/**
 * BUG-011 — a place search must answer about the place that was ASKED FOR.
 *
 * ============================================================================
 * THE PRODUCTION FAILURE
 * ============================================================================
 * The user asked about **Quy Nhơn** while standing in Ho Chi Minh City. The reply recommended:
 *
 *     "Công viên bờ sông Sài Gòn (~0.9km) để thả lỏng sau ngày dài."
 *
 * Nothing was hallucinated, and that is the point. `searchPlacesOSM` replaced the requested
 * destination with the caller's GPS (`if (locationBias) { lat = locationBias.lat … }`), searched
 * 2 km around Saigon, and returned a real Saigon park carrying a real `distance_km` measured from
 * the user. The ranker then scored 0.9 km at 0.91 on proximity and promoted it to THE
 * recommendation. Every layer after retrieval reported the wrong entity faithfully.
 *
 * ============================================================================
 * WHAT IS GUARDED HERE
 * ============================================================================
 *   1. the SEARCH CENTRE is the destination, not the GPS, whenever the two differ;
 *   2. the RESULT SET carries nothing outside the destination;
 *   3. `distance_km` exists only when the search was actually centred on the user;
 *   4. and none of that disturbs "near me", same-city, or unresolvable-place searches.
 *
 * Asserting only (2) would leave the provider being asked the wrong question and the answer
 * merely being cleaned up afterwards — slower, more expensive, and one empty result set away from
 * failing again. Asserting only (1) would trust the provider to honour the centre. Both, like the
 * weather contract this mirrors (`weatherCountryContract.test.ts`, same defect class one tool
 * over), or neither is worth much.
 */

const QUY_NHON = cityForAlias('quy nhon')!
const HCMC = cityForAlias('ho chi minh')!
const DA_NANG = cityForAlias('da nang')!
const HANOI = cityForAlias('ha noi')!

const gps = (c: typeof QUY_NHON) => ({ lat: c.coords[0], lng: c.coords[1] })

/** A venue a few hundred metres from a city's centre — unambiguously in that city. */
const venueIn = (c: typeof QUY_NHON, name: string) => ({
  lat: c.coords[0] + 0.004,
  lon: c.coords[1] + 0.004,
  tags: { name, tourism: 'attraction' },
})

interface Captured { overpass: string[]; googleBodies: Record<string, unknown>[] }
let captured: Captured

/**
 * Routes every outbound call by URL so one stub can drive both providers.
 *
 * `elements` is what Overpass returns; `places` is what Google returns. Anything else — Serper,
 * Nominatim — answers empty, so a test only exercises the path it is about.
 */
function stubFetch(opts: { elements?: unknown[]; places?: unknown[] } = {}) {
  captured = { overpass: [], googleBodies: [] }
  const impl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('overpass')) {
      captured.overpass.push(url)
      return new Response(JSON.stringify({ elements: opts.elements ?? [] }), { status: 200 })
    }
    if (url.includes('places.googleapis.com')) {
      captured.googleBodies.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response(JSON.stringify({ places: opts.places ?? [] }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })
  vi.stubGlobal('fetch', impl)
  return impl
}

/** The `around:RADIUS,LAT,LON` the Overpass query actually asked for. */
function overpassCentre(url: string): { radius: number; lat: number; lon: number } {
  const m = decodeURIComponent(url).match(/around:(\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (!m) throw new Error(`no around: clause in ${url}`)
  return { radius: Number(m[1]), lat: Number(m[2]), lon: Number(m[3]) }
}

const names = (r: unknown) => ((r as { results?: { name: string }[] }).results ?? []).map(x => x.name)
const rows = (r: unknown) => ((r as { results?: Record<string, unknown>[] }).results ?? [])

beforeEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

// ── 0 · The pure predicates ─────────────────────────────────────────────────

describe('BUG-011 · resolveSearchScope', () => {
  it('a named city the caller is NOT in is remote', () => {
    expect(resolveSearchScope('Quy Nhơn', gps(HCMC))).toEqual({ destination: QUY_NHON, remote: true })
  })

  it('the city the caller IS in is not remote — that is a nearby search', () => {
    expect(resolveSearchScope('Ho Chi Minh', gps(HCMC)).remote).toBe(false)
  })

  it('no location is never remote, whatever the GPS', () => {
    expect(resolveSearchScope(undefined, gps(HCMC))).toEqual({ destination: null, remote: false })
  })

  it('an unresolvable place is never remote — unknown must not become a filter', () => {
    expect(resolveSearchScope('Đảo Cái Chiên', gps(HCMC))).toEqual({ destination: null, remote: false })
  })

  it('a named city with NO GPS is not remote — there is nothing to override', () => {
    expect(resolveSearchScope('Quy Nhơn', null).remote).toBe(false)
  })

  it('finds the city inside a longer phrase, not just an exact name', () => {
    expect(resolveSearchScope('du lịch Quy Nhơn Bình Định', gps(HCMC)).destination).toBe(QUY_NHON)
  })
})

describe('BUG-011 · belongsToDestination is asymmetric on purpose', () => {
  it('keeps a place inside the destination', () => {
    expect(belongsToDestination(QUY_NHON, [13.7825, 109.2200], null)).toBe(true)
  })

  it('rejects a place outside it', () => {
    expect(belongsToDestination(QUY_NHON, HCMC.coords, null)).toBe(false)
  })

  it('rejects an address that resolves to a DIFFERENT known city', () => {
    expect(belongsToDestination(QUY_NHON, null, '2 Nguyễn Huệ, Quận 1, Hồ Chí Minh')).toBe(false)
  })

  it('KEEPS an address that resolves to nothing — unknown is not wrong', () => {
    // The line that decides whether this guard is safe. Most OSM venues carry no city in their
    // address; classifying them as out-of-scope would silently empty legitimate result sets.
    expect(belongsToDestination(QUY_NHON, null, '12 đường không tên')).toBe(true)
    expect(belongsToDestination(QUY_NHON, null, null)).toBe(true)
  })

  it('keeps everything when no destination was requested', () => {
    expect(belongsToDestination(null, HCMC.coords, 'anywhere')).toBe(true)
  })
})

// ── 1 · The production regression ───────────────────────────────────────────

describe('BUG-011 · 1 — Quy Nhơn request, Saigon GPS (the production case)', () => {
  it('returns no place outside Quy Nhơn, and none with a Saigon address', async () => {
    stubFetch({
      elements: [
        venueIn(HCMC, 'Công viên bờ sông Sài Gòn'),
        venueIn(QUY_NHON, 'Quảng trường Nguyễn Tất Thành'),
      ],
    })
    const r = await searchPlacesOSM('cong vien', 'Quy Nhơn', 'attraction', gps(HCMC))

    expect(names(r)).toEqual(['Quảng trường Nguyễn Tất Thành'])
    expect(names(r).join(' ')).not.toMatch(/Sài Gòn|Saigon|Hồ Chí Minh/i)
  })

  it('every returned place is within the city-match radius of Quy Nhơn', async () => {
    stubFetch({
      elements: [venueIn(HCMC, 'Saigon park'), venueIn(QUY_NHON, 'Quy Nhon park'), venueIn(DA_NANG, 'Da Nang park')],
    })
    const r = await searchPlacesOSM('cong vien', 'Quy Nhơn', 'attraction', gps(HCMC))
    expect(rows(r).length).toBeGreaterThan(0)
    for (const row of rows(r)) {
      const m = String(row.maps_link).match(/q=(-?[\d.]+),(-?[\d.]+)/)!
      const d = haversineKm(QUY_NHON.coords, [Number(m[1]), Number(m[2])])
      expect(d, `${row.name} is ${d.toFixed(1)}km from Quy Nhơn`).toBeLessThanOrEqual(CITY_MATCH_RADIUS_KM)
    }
  })
})

// ── 2 · The search centre ───────────────────────────────────────────────────

describe('BUG-011 · 2 — the OSM search is centred on the destination, not the GPS', () => {
  it('asks Overpass around Quy Nhơn while the caller is in Saigon', async () => {
    stubFetch({ elements: [] })
    await searchPlacesOSM('cong vien', 'Quy Nhơn', 'attraction', gps(HCMC))

    const c = overpassCentre(captured.overpass[0])
    expect(haversineKm(QUY_NHON.coords, [c.lat, c.lon])).toBeLessThan(1)
    // And emphatically NOT the caller's position.
    expect(haversineKm(HCMC.coords, [c.lat, c.lon])).toBeGreaterThan(100)
  })
})

// ── 3 · The city matrix ─────────────────────────────────────────────────────

describe('BUG-011 · 3 — destination scope holds across cities', () => {
  const MATRIX: Array<[typeof QUY_NHON, typeof QUY_NHON]> = [
    [QUY_NHON, HCMC],
    [DA_NANG, HANOI],
    [HANOI, HCMC],
    [HCMC, DA_NANG],
  ]

  it.each(MATRIX)('destination %#: centre and results stay in the destination', async (dest, userCity) => {
    stubFetch({ elements: [venueIn(userCity, 'HOME CITY VENUE'), venueIn(dest, 'DESTINATION VENUE')] })
    const r = await searchPlacesOSM('quan an', dest.query, undefined, gps(userCity))

    const c = overpassCentre(captured.overpass[0])
    expect(haversineKm(dest.coords, [c.lat, c.lon])).toBeLessThan(1)
    expect(names(r)).toEqual(['DESTINATION VENUE'])
  })
})

// ── 4 · The distance contract ───────────────────────────────────────────────

describe('BUG-011 · 4 — distance_km only exists when it means "from you"', () => {
  it('is ABSENT on a remote destination search', async () => {
    stubFetch({ elements: [venueIn(QUY_NHON, 'Quy Nhon park')] })
    const r = await searchPlacesOSM('cong vien', 'Quy Nhơn', 'attraction', gps(HCMC))
    expect(rows(r)[0]).not.toHaveProperty('distance_km')
  })

  it('is PRESENT and measured from the GPS on a nearby search', async () => {
    const here = gps(HCMC)
    stubFetch({ elements: [venueIn(HCMC, 'Quán gần đây')] })
    const r = await searchPlacesOSM('quan an', undefined, undefined, here)

    const row = rows(r)[0]
    expect(row).toHaveProperty('distance_km')
    const m = String(row.maps_link).match(/q=(-?[\d.]+),(-?[\d.]+)/)!
    const expected = haversineKm([here.lat, here.lng], [Number(m[1]), Number(m[2])])
    expect(row.distance_km as number).toBeCloseTo(Math.round(expected * 10) / 10, 1)
  })

  it('is absent when there is no GPS at all', async () => {
    stubFetch({ elements: [venueIn(QUY_NHON, 'Quy Nhon park')] })
    const r = await searchPlacesOSM('cong vien', 'Quy Nhơn', 'attraction', null)
    expect(rows(r)[0]).not.toHaveProperty('distance_km')
  })
})

// ── 5, 6, 7 · Everything that must NOT change ───────────────────────────────

describe('BUG-011 · 5 — same-city keeps the nearby behaviour', () => {
  it('centres on the GPS with the tight nearby radius when the destination is the caller’s city', async () => {
    const here = { lat: HCMC.coords[0] + 0.01, lng: HCMC.coords[1] + 0.01 }
    stubFetch({ elements: [venueIn(HCMC, 'Quán Q1')] })
    const r = await searchPlacesOSM('quan an', 'Ho Chi Minh', undefined, here)

    const c = overpassCentre(captured.overpass[0])
    expect(c.lat).toBeCloseTo(here.lat, 5)
    expect(c.lon).toBeCloseTo(here.lng, 5)
    expect(c.radius).toBe(2000)
    expect(rows(r)[0]).toHaveProperty('distance_km')
  })
})

describe('BUG-011 · 6 — no location supplied leaves "near me" untouched', () => {
  it('centres on the GPS at the nearby radius', async () => {
    const here = gps(HCMC)
    stubFetch({ elements: [venueIn(HCMC, 'Quán gần đây')] })
    await searchPlacesOSM('quan an', undefined, undefined, here)

    const c = overpassCentre(captured.overpass[0])
    expect(c.lat).toBeCloseTo(here.lat, 5)
    expect(c.lon).toBeCloseTo(here.lng, 5)
    expect(c.radius).toBe(2000)
  })

  it('does not filter results when no destination was named', async () => {
    // A venue outside the caller's city is unusual within a 2km radius, but if the provider
    // returns one there is no requested destination to judge it against — dropping it would be
    // the guard inventing a scope nobody asked for.
    stubFetch({ elements: [venueIn(DA_NANG, 'FAR VENUE')] })
    const r = await searchPlacesOSM('quan an', undefined, undefined, gps(HCMC))
    expect(names(r)).toEqual(['FAR VENUE'])
  })
})

describe('BUG-011 · 7 — an unresolvable destination introduces no new filter', () => {
  it('keeps existing behaviour for a place the city table does not know', async () => {
    stubFetch({ elements: [venueIn(HCMC, 'A'), venueIn(DA_NANG, 'B')] })
    const r = await searchPlacesOSM('quan an', 'Đảo Cái Chiên', undefined, gps(HCMC))

    // Unchanged: GPS-centred, nothing filtered, distance still reported.
    const c = overpassCentre(captured.overpass[0])
    expect(c.lat).toBeCloseTo(HCMC.coords[0], 5)
    expect(names(r).sort()).toEqual(['A', 'B'])
    expect(rows(r)[0]).toHaveProperty('distance_km')
  })
})

// ── 8 · Turn-to-turn sanity ─────────────────────────────────────────────────

describe('BUG-011 · 8 — a previous destination cannot contaminate the next search', () => {
  it('a Saigon search followed by a Quy Nhơn search returns no Saigon place', async () => {
    stubFetch({ elements: [venueIn(HCMC, 'Saigon place'), venueIn(QUY_NHON, 'Quy Nhon place')] })

    const first = await searchPlacesOSM('quan an', 'Sài Gòn', undefined, gps(HCMC))
    expect(names(first)).toContain('Saigon place')

    const second = await searchPlacesOSM('quan an', 'Quy Nhơn', undefined, gps(HCMC))
    expect(names(second)).toEqual(['Quy Nhon place'])
    expect(names(second)).not.toContain('Saigon place')
  })
})

// ── 9 · The Google provider path ────────────────────────────────────────────

describe('BUG-011 · 9 — the Google path is scoped too', () => {
  const googlePlace = (name: string, address: string) => ({
    id: `id-${name}`, displayName: { text: name }, formattedAddress: address,
    rating: 4.5, userRatingCount: 100, googleMapsUri: 'https://maps.google.com/x',
  })

  /**
   * `searchPlaces` memoises on (query, location, type, GPS, lang) in the module-level cache in
   * ./common, which has no reset hook and lives for the whole test file. Two cases sharing a
   * query would have the second silently assert the FIRST one's stubbed response — green, and
   * measuring nothing. A unique query per case is what keeps each one honest.
   */
  let n = 0
  const uniqueQuery = () => `cong vien case ${++n}`

  beforeEach(() => vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key'))

  it('drops the GPS locationBias for a remote destination', async () => {
    stubFetch({ places: [googlePlace('Quy Nhon park', 'Quy Nhơn, Bình Định')] })
    await searchPlaces(uniqueQuery(), 'Quy Nhơn', 'attraction', 'vi', gps(HCMC))

    expect(captured.googleBodies[0]).not.toHaveProperty('locationBias')
    // The destination still reaches the provider, through the text query.
    expect(String(captured.googleBodies[0].textQuery)).toContain('Quy Nhơn')
  })

  it('keeps the locationBias for a nearby search', async () => {
    stubFetch({ places: [googlePlace('Quán gần đây', 'Quận 1, Hồ Chí Minh')] })
    await searchPlaces(uniqueQuery(), 'Ho Chi Minh', undefined, 'vi', gps(HCMC))
    expect(captured.googleBodies[0]).toHaveProperty('locationBias')
  })

  it('rejects a place whose address is a different city', async () => {
    stubFetch({
      places: [
        googlePlace('Công viên bờ sông Sài Gòn', 'Thủ Thiêm, Quận 2, Hồ Chí Minh'),
        googlePlace('Quảng trường Quy Nhơn', 'Nguyễn Tất Thành, Quy Nhơn, Bình Định'),
      ],
      elements: [],
    })
    const r = await searchPlaces(uniqueQuery(), 'Quy Nhơn', 'attraction', 'vi', gps(HCMC))
    expect(names(r)).toEqual(['Quảng trường Quy Nhơn'])
  })

  it('keeps a place whose address names no known city', async () => {
    stubFetch({ places: [googlePlace('Quán không rõ', '12 đường không tên')] })
    const r = await searchPlaces(uniqueQuery(), 'Quy Nhơn', undefined, 'vi', gps(HCMC))
    expect(names(r)).toEqual(['Quán không rõ'])
  })

  it('falls through to OSM when every Google result is out of scope', async () => {
    // Returning an empty Google set for a real city would be worse than asking the other
    // provider — which is now centred on the destination.
    stubFetch({
      places: [googlePlace('Saigon only', 'Quận 1, Hồ Chí Minh')],
      elements: [venueIn(QUY_NHON, 'OSM Quy Nhon place')],
    })
    const r = await searchPlaces(uniqueQuery(), 'Quy Nhơn', 'attraction', 'vi', gps(HCMC))
    expect(names(r)).toEqual(['OSM Quy Nhon place'])
  })
})
