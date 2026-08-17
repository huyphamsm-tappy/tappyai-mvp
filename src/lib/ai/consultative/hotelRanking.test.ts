import { describe, it, expect } from 'vitest'
import { normalizeHotels } from './candidate'
import { rankCandidates } from './rank'
import { derivePick } from './pick'
import type { NeedProfile } from './needProfile'

// ── HOTEL-RANK-01…05, HOTEL-PICK-01…02 ─────────────────────────────────────
//
// The Final Gap Audit found Hotel ranking WIRED but never EXERCISED: the
// normalizer had tests, yet no test ranked a hotel set or derived a hotel Pick,
// and the two scoring branches unique to hotels — `stars` and `directPage` — had
// zero coverage. This closes that evidence gap.
//
// Hotel is NOT redesigned. No richer data model, no price parsed from marketing
// snippets. These tests exercise exactly the shipped normalized shape:
//
//   search_results → { name: title, attrs.directPage, link }
//   hotel_list     → { name, attrs.stars, attrs.distanceKm, link: maps_link }

function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'hotel', subject: 'hotel', budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}
const prio = (key: string, weight = 2) => ({ key, weight, source: 'stated' as const })

/** A get_hotel_prices result in the shape travel.ts emits. */
const HOTEL_RESULT = {
  search_results: [
    { title: 'TTR Skypool Boutique Hotel', link: 'https://www.booking.com/hotel/vn/ttr-skypool.html', snippet: 'Từ 393.582 VND/đêm' },
    { title: 'Cheap hotels in Da Nang', link: 'https://www.booking.com/searchresults.html?ss=Da+Nang', snippet: 'Find deals' },
  ],
  hotel_list: [
    { name: 'AOA Da Nang Beach Hotel', address: '12 Võ Nguyên Giáp', maps_link: 'https://www.google.com/maps?q=16.05,108.24', stars: '4', distance_km: 0.3 },
    { name: 'Nhà nghỉ Bình Dân', address: '80 Hoàng Diệu', maps_link: 'https://www.google.com/maps?q=16.06,108.21', stars: '2', distance_km: 4.5 },
  ],
  booking_link: 'https://www.booking.com/searchresults.html?ss=Da+Nang',
}

describe('HOTEL-RANK-01 — a direct booking page outranks a search page', () => {
  // `directPage` is the ONLY structured trust signal a Serper hotel result
  // carries, and it had no test. Both candidates are otherwise identical.
  const pages = normalizeHotels({
    search_results: [
      { title: 'Search Results Page', link: 'https://www.booking.com/searchresults.html?ss=Da+Nang', snippet: '' },
      { title: 'Real Hotel Page', link: 'https://www.booking.com/hotel/vn/real.html', snippet: '' },
    ],
  })
  const r = rankCandidates(pages, profile())

  it('the specific hotel page wins', () => {
    expect(r.ranked[0].candidate.name).toBe('Real Hotel Page')
  })

  it('and says so, naming the reason', () => {
    expect(r.ranked[0].reasons.map(x => x.key)).toContain('directPage')
  })

  it('the search-results page contributes nothing for it', () => {
    const loser = r.ranked.find(e => e.candidate.name === 'Search Results Page')!
    expect(loser.reasons.map(x => x.key)).not.toContain('directPage')
    expect(loser.score).toBe(0)
  })

  it('a set of ONLY search pages is not rankable — provider order is not a decision', () => {
    const onlySearch = normalizeHotels({
      search_results: [
        { title: 'A', link: 'https://www.booking.com/searchresults.html?ss=x', snippet: '' },
        { title: 'B', link: 'https://www.booking.com/searchresults.html?ss=y', snippet: '' },
      ],
    })
    expect(rankCandidates(onlySearch, profile()).rankable).toBe(false)
  })
})

describe('HOTEL-RANK-02 — star rating contributes', () => {
  const c = normalizeHotels(HOTEL_RESULT)
  const r = rankCandidates(c, profile())

  it('the 4-star OSM hotel outranks the 2-star one', () => {
    const four = r.ranked.findIndex(e => e.candidate.name.includes('AOA'))
    const two = r.ranked.findIndex(e => e.candidate.name.includes('Bình Dân'))
    expect(four).toBeLessThan(two)
  })

  it('the stars reason is grounded in the actual value', () => {
    const four = r.ranked.find(e => e.candidate.name.includes('AOA'))!
    const stars = four.reasons.find(x => x.key === 'stars')
    expect(stars).toBeDefined()
    expect(stars!.detail).toContain('4')
  })

  it('a hotel with no stars tag gets no stars reason and no penalty', () => {
    const noStars = normalizeHotels({ hotel_list: [{ name: 'Chưa rõ hạng', maps_link: 'https://m/x', distance_km: 1 }] })
    const rr = rankCandidates(noStars, profile())
    expect(rr.ranked[0].reasons.map(x => x.key)).not.toContain('stars')
    expect(rr.ranked[0].score).toBeGreaterThan(0) // distance still scores
  })

  it('an out-of-range stars value is ignored rather than coerced', () => {
    const bad = normalizeHotels({ hotel_list: [{ name: 'X', maps_link: 'https://m/x', stars: '9' }] })
    expect(bad[0].attrs.stars).toBeUndefined()
  })
})

describe('HOTEL-RANK-03 — a user priority changes the hotel order', () => {
  // Measured while writing these tests: with no stated priority, BASE.distance
  // (0.5) outweighs BASE.stars (0.4) AND normalises higher at short range, so a
  // near 2-star already beats a far 5-star. That is the shipped behaviour, not a
  // defect — with nothing stated, "close" is a defensible default for a hotel —
  // and it is recorded here rather than tuned away.
  const FAR_LUXURY_VS_NEAR_BASIC = normalizeHotels({
    hotel_list: [
      { name: 'Sang Trọng Xa', maps_link: 'https://m/far', stars: '5', distance_km: 9.0 },
      { name: 'Bình Dị Gần', maps_link: 'https://m/near', stars: '2', distance_km: 0.2 },
    ],
  })

  it('baseline: with nothing stated, proximity carries the day', () => {
    expect(rankCandidates(FAR_LUXURY_VS_NEAR_BASIC, profile()).ranked[0].candidate.name).toBe('Bình Dị Gần')
  })

  it('a stars priority flips it to the luxury hotel', () => {
    const byStars = rankCandidates(FAR_LUXURY_VS_NEAR_BASIC, profile({ priorities: [prio('stars', 4)] }))
    expect(byStars.ranked[0].candidate.name).toBe('Sang Trọng Xa')
    expect(byStars.ranked[0].reasons.map(x => x.key)).toContain('stars')
  })

  // The other direction, on a pair where stars wins by default.
  const NEAR_MID_VS_FAR_LUXURY = normalizeHotels({
    hotel_list: [
      { name: 'Xa 5 Sao', maps_link: 'https://m/x5', stars: '5', distance_km: 3.0 },
      { name: 'Gần 3 Sao', maps_link: 'https://m/g3', stars: '3', distance_km: 2.5 },
    ],
  })

  it('baseline: the 5-star leads when the distance gap is small', () => {
    expect(rankCandidates(NEAR_MID_VS_FAR_LUXURY, profile()).ranked[0].candidate.name).toBe('Xa 5 Sao')
  })

  it('a distance priority — reachable from "gần hơn" / "closer" — flips it', () => {
    const byDistance = rankCandidates(NEAR_MID_VS_FAR_LUXURY, profile({ priorities: [prio('distance', 4)] }))
    expect(byDistance.ranked[0].candidate.name).toBe('Gần 3 Sao')
    expect(byDistance.ranked[0].reasons.map(x => x.key)).toContain('distance')
  })

  it('the two orders genuinely differ — user-specific ranking holds for Hotel', () => {
    const a = rankCandidates(NEAR_MID_VS_FAR_LUXURY, profile()).ranked.map(x => x.candidate.name)
    const b = rankCandidates(NEAR_MID_VS_FAR_LUXURY, profile({ priorities: [prio('distance', 4)] })).ranked.map(x => x.candidate.name)
    expect(a).not.toEqual(b)
  })
})

describe('HOTEL-RANK-04 — budget behaviour, given hotels carry no structured price', () => {
  const c = normalizeHotels(HOTEL_RESULT)

  it('no hotel candidate carries a price — the snippet figure is deliberately not read', () => {
    // "Từ 393.582 VND/đêm" is present in the fixture snippet. Reading it would
    // make it both rankable and quotable, and no provider contract says that is
    // the rate for the user's dates.
    for (const x of c) expect(x.attrs.priceVnd).toBeUndefined()
  })

  it('a stated budget therefore filters NOTHING — unknown price is not over-budget', () => {
    const r = rankCandidates(c, profile({ budget: { min: 0, max: 500_000, type: 'under' }, budgetStated: 500_000 }))
    expect(r.filtered).toHaveLength(0)
    expect(r.ranked).toHaveLength(c.length)
  })

  it('the shipped snippet-based budget filter is upstream and untouched by ranking', () => {
    // applyBudgetFilter runs on the tool result BEFORE normalization, which is
    // where snippet-price filtering legitimately lives. The ranker adds nothing.
    const r = rankCandidates(c, profile({ budget: { min: 0, max: 500_000, type: 'under' } }))
    expect(r.budgetFilterEmpty).toBe(false)
  })
})

describe('HOTEL-RANK-05 — determinism and no invented attributes', () => {
  const c = normalizeHotels(HOTEL_RESULT)
  const need = profile({ priorities: [prio('distance')] })

  it('identical inputs give byte-identical output, 50 runs', () => {
    const first = JSON.stringify(rankCandidates(c, need))
    for (let i = 0; i < 50; i++) expect(JSON.stringify(rankCandidates(c, need))).toBe(first)
  })

  it('input order does not decide the outcome', () => {
    const fwd = rankCandidates(c, need).ranked.map(x => x.candidate.name)
    const rev = rankCandidates([...c].reverse(), need).ranked.map(x => x.candidate.name)
    expect(rev).toEqual(fwd)
  })

  it('no attribute exists that the tool result did not supply', () => {
    for (const x of c) {
      for (const [k, v] of Object.entries(x.attrs)) {
        expect(v, `${x.name}.${k} must not be a fabricated default`).not.toBeUndefined()
      }
      // Hotels have no rating, wifi, cuisine or price in this shape.
      expect(x.attrs.rating).toBeUndefined()
      expect(x.attrs.wifi).toBeUndefined()
      expect(x.attrs.cuisine).toBeUndefined()
    }
  })

  it('a missing distance is recorded, never guessed', () => {
    const noDist = normalizeHotels({ hotel_list: [{ name: 'X', maps_link: 'https://m/x', stars: '3' }] })
    const r = rankCandidates(noDist, profile({ priorities: [prio('distance')] }))
    expect(r.ranked[0].missing).toContain('distance')
    expect(r.ranked[0].candidate.attrs.distanceKm).toBeUndefined()
  })
})

describe('HOTEL-PICK-01 — the Pick is ranked[0]', () => {
  const c = normalizeHotels({
    hotel_list: [
      { name: 'Gần Trung Tâm', maps_link: 'https://m/near', stars: '4', distance_km: 0.3 },
      { name: 'Xa Trung Tâm', maps_link: 'https://m/far', stars: '2', distance_km: 7.8 },
    ],
  })
  const need = profile({ priorities: [prio('distance')] })
  const r = rankCandidates(c, need)
  const pick = derivePick(r, need)

  it('a Pick exists for a decidable hotel turn', () => {
    expect(pick).not.toBeNull()
    expect(pick!.candidate).toBe(r.ranked[0].candidate)
    expect(pick!.candidate.name).toBe('Gần Trung Tâm')
  })

  it('it names the runner-up so a trade-off has something real to sit on', () => {
    expect(pick!.runnerUp?.candidate.name).toBe('Xa Trung Tâm')
  })

  it('its reasons are grounded in hotel evidence', () => {
    expect(pick!.reasons.length).toBeGreaterThan(0)
    expect(pick!.reasons.map(x => x.key).some(k => ['stars', 'distance', 'directPage'].includes(k))).toBe(true)
  })

  it('no Pick when only one hotel survives — an answer, not a choice', () => {
    const one = normalizeHotels({ hotel_list: [{ name: 'Chỉ Một', maps_link: 'https://m/one', stars: '3' }] })
    expect(derivePick(rankCandidates(one, need), need)).toBeNull()
  })

  it('no Pick when the user stated nothing to decide by', () => {
    const bare = profile()
    expect(derivePick(rankCandidates(c, bare), bare)).toBeNull()
  })
})

describe('HOTEL-PICK-02 — the Pick keeps its own hotel identity and link', () => {
  const c = normalizeHotels(HOTEL_RESULT)
  const need = profile({ priorities: [prio('distance', 4)] })
  const pick = derivePick(rankCandidates(c, need), need)!

  it('the Pick is reference-identical to a normalized candidate', () => {
    expect(c).toContain(pick.candidate)
  })

  it('its link is its OWN, never another hotel\'s', () => {
    const source = c.find(x => x.name === pick.candidate.name)!
    expect(pick.candidate.link).toBe(source.link)
    for (const other of c) {
      if (other === pick.candidate) continue
      expect(pick.candidate.link).not.toBe(other.link)
    }
  })

  it('the original tool record rides through untouched', () => {
    expect(pick.candidate.raw).toBeTruthy()
    expect((pick.candidate.raw as Record<string, unknown>).name ?? (pick.candidate.raw as Record<string, unknown>).title)
      .toBe(pick.candidate.name)
  })

  it('reordering never moves a booking link onto a different hotel', () => {
    const byName = new Map(c.map(x => [x.name, x.link]))
    for (const need2 of [profile(), profile({ priorities: [prio('distance', 5)] }), profile({ priorities: [prio('stars', 5)] })]) {
      for (const e of rankCandidates(c, need2).ranked) {
        expect(e.candidate.link, `${e.candidate.name} link changed under reordering`).toBe(byName.get(e.candidate.name))
      }
    }
  })
})
