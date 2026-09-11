import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchPlacesOSM } from './food'
import { osmCategoryFor, placeDomainFor } from './osmCategory'
import { __clearToolCache } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE SHARED PLACE PIPELINE SUBSTITUTED A DEFAULT INSTEAD OF ADMITTING A GAP.
//
// One root cause, three faces, all measured on localhost 2026-09-08 and all in
// code that every place domain (Food, Spa, Entertainment) runs through:
//
//   1. NO AREA     → `location || 'Ha Noi'` searched Hanoi and recommended
//                    Hanoi cafes for "Quán cafe view đẹp", disclosing nothing.
//   2. UNRESOLVED  → lat/lon are initialised to Hanoi and a failed geocode left
//                    them there, so "… ở Quy Nhơn" searched Hanoi while the
//                    result still reported Quy Nhơn.
//   3. NO CATEGORY → shopping centres had no tag mapping at all, so "Trung tâm
//                    mua sắm lớn Sài Gòn" became a restaurant/attraction search
//                    and the reply itself admitted the results were wrong.
//
// The rule these hold: the pipeline may return nothing and say so, but it may
// never answer about a place, a city or a category it did not actually search.
// ─────────────────────────────────────────────────────────────────────────────

let overpassCalls: string[]

// Quy Nhơn, matching the geocode stub below and the GPS the tests pass.
const OSM_ROWS = {
  elements: [
    { type: 'node', lat: 13.78, lon: 109.22, tags: { name: 'Quán A', 'addr:street': 'Phố A' } },
    { type: 'node', lat: 13.79, lon: 109.23, tags: { name: 'Quán B', 'addr:street': 'Phố B' } },
  ],
}

/**
 * 🚨 THE ROWS AND THE REQUESTED CITY MUST AGREE, or BUG-011's output guard
 * rejects them — correctly. `belongsToDestination` (food.ts, D3) drops any row
 * whose coordinates fall outside the destination the caller named, so a fixture
 * that asks for Hà Nội and answers with Quy Nhơn coordinates now returns zero
 * rows. That is the guard doing its job on a fixture that was never
 * geographically coherent; the fixture moves, the guard stays.
 */
const HANOI_ROWS = {
  elements: [
    { type: 'node', lat: 21.0285, lon: 105.8542, tags: { name: 'Quán A', 'addr:street': 'Phố A' } },
    { type: 'node', lat: 21.03, lon: 105.86, tags: { name: 'Quán B', 'addr:street': 'Phố B' } },
  ],
}

function stub(geocode: 'ok' | 'fail' | 'empty' = 'ok', rows: unknown = OSM_ROWS) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('nominatim')) {
      if (geocode === 'fail') throw new Error('timeout')
      if (geocode === 'empty') return new Response('[]', { status: 200 })
      return new Response(JSON.stringify([{ lat: '13.7829', lon: '109.2196' }]), { status: 200 })
    }
    if (url.includes('overpass') || url.includes('maps.mail.ru')) {
      overpassCalls.push(url)
      return new Response(JSON.stringify(rows), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  }))
}

beforeEach(() => { overpassCalls = []; __clearToolCache() })
afterEach(() => { vi.unstubAllGlobals() })

interface PlaceResult {
  location_required?: boolean
  location_unresolved?: boolean
  location?: string
  results?: unknown[]
  no_results_instruction?: string
}

describe('🚨 FACE 1 — no area given: ask, never assume a city', () => {
  it('searches nothing and says a location is required', async () => {
    stub()
    const r = await searchPlacesOSM('cafe view dep') as PlaceResult
    expect(r.location_required).toBe(true)
    expect(r.results).toEqual([])
    expect(overpassCalls, 'nothing may be searched without knowing where').toHaveLength(0)
  })

  it('🚨 never reports a city it invented', async () => {
    stub()
    const r = await searchPlacesOSM('cafe view dep') as PlaceResult
    // The INSTRUCTION deliberately names cities as things not to pick; what must
    // never happen is the result claiming one as the place it searched.
    expect(r.location).toBeUndefined()
    expect(r.results).toEqual([])
  })

  it('the instruction tells the caller to ASK, in both languages', async () => {
    stub()
    const viRes = await searchPlacesOSM('cafe', undefined, undefined, null, 'vi') as PlaceResult
    const enRes = await searchPlacesOSM('cafe', undefined, undefined, null, 'en') as PlaceResult
    expect(viRes.no_results_instruction).toMatch(/hoi/i)
    expect(enRes.no_results_instruction).toMatch(/Ask the user/i)
  })

  it('GPS alone is a real location — it still searches', async () => {
    stub()
    const r = await searchPlacesOSM('cafe', undefined, 'cafe', { lat: 13.78, lng: 109.22 }) as PlaceResult
    expect(r.location_required).toBeUndefined()
    expect(overpassCalls.length).toBeGreaterThan(0)
  })

  it('an explicitly named city still searches, exactly as before', async () => {
    stub('ok', HANOI_ROWS)
    const r = await searchPlacesOSM('cafe', 'Ha Noi', 'cafe') as PlaceResult
    expect(r.location_required).toBeUndefined()
    expect(r.location).toBe('Ha Noi')
    expect((r.results ?? []).length).toBeGreaterThan(0)
  })
})

describe('🚨 FACE 2 — a city we cannot place is not searched elsewhere', () => {
  // A place genuinely absent from the shared city table, so the geocoder is the
  // only way to place it — unlike Quy Nhơn, which the table now resolves directly.
  const UNKNOWN_PLACE = 'Xóm Bãi Ngang Nghĩa Trung'

  for (const mode of ['fail', 'empty'] as const) {
    it(`a ${mode}ing geocode returns location_unresolved, not Hanoi rows`, async () => {
      stub(mode)
      const r = await searchPlacesOSM('cafe view dep', UNKNOWN_PLACE, 'cafe') as PlaceResult
      expect(r.location_unresolved).toBe(true)
      expect(r.results).toEqual([])
      expect(overpassCalls, 'must not search coordinates we never established').toHaveLength(0)
      expect(r.location).toBe(UNKNOWN_PLACE)
    })
  }

  it('🚨 a SUCCESSFUL geocode searches the right place', async () => {
    stub('ok')
    const r = await searchPlacesOSM('cafe view dep', UNKNOWN_PLACE, 'cafe') as PlaceResult
    expect(r.location_unresolved).toBeUndefined()
    expect((r.results ?? []).length).toBeGreaterThan(0)
    // The geocoded coordinates, never Hanoi's.
    expect(overpassCalls.join(' ')).toContain('13.78')
    expect(overpassCalls.join(' ')).not.toContain('21.0285')
  })

  it('🚨 a city the SHARED table knows never needs the geocoder at all', async () => {
    // The defect: searchPlacesOSM carried a private 16-alias list without Quy
    // Nhơn, while vietnamCities.ts — which weather already uses — has it with
    // coordinates. An explicitly named city was reported as un-lookupable.
    stub('fail')   // geocoding is broken; it must not matter
    const r = await searchPlacesOSM('cafe view dep', 'Quy Nhơn', 'cafe') as PlaceResult
    expect(r.location_unresolved).toBeUndefined()
    expect((r.results ?? []).length).toBeGreaterThan(0)
    expect(overpassCalls.join(' ')).toContain('13.782')
  })

  it('finds the city inside a longer phrase, diacritics or not', async () => {
    for (const phrase of ['ở Quy Nhơn', 'quy nhon', 'Quy Nhơn, Bình Định']) {
      overpassCalls = []
      __clearToolCache()
      stub('fail')
      const r = await searchPlacesOSM('cafe', phrase, 'cafe') as PlaceResult
      expect(r.location_unresolved, phrase).toBeUndefined()
      expect(overpassCalls.join(' '), phrase).toContain('13.782')
    }
  })

  it('a preset city needs no geocode and is unaffected', async () => {
    stub('fail')
    const r = await searchPlacesOSM('cafe', 'Đà Nẵng', 'cafe') as PlaceResult
    expect(r.location_unresolved).toBeUndefined()
    expect(overpassCalls.join(' ')).toContain('16.05')
  })
})

describe('🚨 FACE 3 — shopping centres had no category', () => {
  it('maps mall queries to the tags malls actually carry', () => {
    for (const q of ['trung tâm mua sắm lớn Sài Gòn', 'trung tâm thương mại', 'mall gần đây', 'siêu thị lớn']) {
      const keys = osmCategoryFor(q).selectors.map(s => `${s.key}=${s.value}`)
      expect(keys, q).toContain('shop=mall')
      expect(keys, q).toContain('shop=department_store')
    }
  })

  it('🚨 the label matches what the eligibility boundary admits', () => {
    // OSM_ADMIT.shopping contains 'mall'. If these two disagree, the rows are
    // retrieved and then silently thrown away by applyEligibility.
    expect(osmCategoryFor('trung tâm mua sắm').label).toBe('mall')
  })

  it('🚨 a mall query is the SHOPPING domain, not the food default', () => {
    // domainOf() falls back to 'food' for anything that is not an EntityDomain,
    // and OSM_ADMIT.food does not admit 'mall' — so 'place' would reject them all.
    expect(placeDomainFor('trung tâm mua sắm lớn Sài Gòn')).toBe('shopping')
    expect(placeDomainFor('mall gần đây')).toBe('shopping')
  })

  it('no longer falls through to the restaurant default', () => {
    expect(osmCategoryFor('trung tâm mua sắm').selectors.map(s => s.value)).not.toContain('restaurant')
  })

  it('🚨 an explicit type=mall is honoured — the model can finally SAY it', () => {
    // Without this the enum offered no shopping-centre value, so the model chose
    // 'attraction' and the mall keywords never got a turn (explicit type wins).
    expect(osmCategoryFor("bat ky", "mall").selectors.map(x => x.key + "=" + x.value)).toContain("shop=mall")
    expect(placeDomainFor("bat ky", "mall")).toBe("shopping")
  })

  it('does not steal ordinary queries from the other domains', () => {
    expect(placeDomainFor('quán cafe view đẹp')).toBe('food')
    expect(placeDomainFor('spa tốt')).toBe('spa')
    expect(placeDomainFor('rạp phim hay')).toBe('entertainment')
    expect(osmCategoryFor('quán cafe view đẹp').selectors[0].value).toBe('cafe')
  })
})
