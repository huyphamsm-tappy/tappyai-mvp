import { describe, it, expect } from 'vitest'
import { rankCandidates, type Candidate } from './rank'
import { deriveNeedProfile, type NeedProfile } from './needProfile'

// ── RANK-01…07 — Phase 2 Ranking contract ───────────────────────────────────
//
// Pure functions only: no network, no model, no clock, no randomness, no cost.
// This is the whole point of the deterministic ranker — §14 of the product
// contract ("user priorities change the result") becomes a unit test instead of
// a sampling rate.

function place(name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id: name, name, domain: 'places', attrs, link: `https://maps/${encodeURIComponent(name)}`, raw: { name } }
}

/** Build a profile directly, so a ranking test never depends on extraction. */
function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'places', subject: null, budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}

const prio = (key: string, weight = 2) => ({ key, weight, source: 'stated' as const })

describe('RANK-01 — user priorities change the result', () => {
  // One fixed candidate set. NEAR is close but ordinary; STAR is far but excellent.
  // Neither dominates: which one wins is a statement about the USER, not the data.
  const CANDIDATES = [
    place('Quán Gần', { rating: 4.0, reviewCount: 300, distanceKm: 0.4 }),
    place('Quán Xa Ngon', { rating: 4.8, reviewCount: 5000, distanceKm: 6.5 }),
  ]

  const nearby = rankCandidates(CANDIDATES, profile({ priorities: [prio('distance')] }))
  const quality = rankCandidates(CANDIDATES, profile({ priorities: [prio('rating')] }))

  it('a distance-first user gets the close one', () => {
    expect(nearby.ranked[0].candidate.name).toBe('Quán Gần')
  })

  it('a rating-first user gets the highly-rated one', () => {
    expect(quality.ranked[0].candidate.name).toBe('Quán Xa Ngon')
  })

  it('the two orders genuinely differ — this is the §14 proof', () => {
    expect(nearby.ranked.map(r => r.candidate.name))
      .not.toEqual(quality.ranked.map(r => r.candidate.name))
  })

  it('the winner explains itself by naming the attribute that decided it', () => {
    expect(nearby.ranked[0].reasons.map(r => r.key)).toContain('distance')
    expect(quality.ranked[0].reasons.map(r => r.key)).toContain('rating')
  })

  it('the mechanism is domain-agnostic — the same ranker orders priced candidates', () => {
    // Proves the ranker generalises to Shopping the moment structured retrieval
    // lands (G3). No second engine will be needed.
    const products: Candidate[] = [
      { id: 'a', name: 'A', domain: 'shopping', attrs: { priceVnd: 28_000_000, rating: 4.2 }, link: 'https://s/a', raw: {} },
      { id: 'b', name: 'B', domain: 'shopping', attrs: { priceVnd: 20_000_000, rating: 4.0 }, link: 'https://s/b', raw: {} },
    ]
    const cheap = rankCandidates(products, profile({ domain: 'shopping', priorities: [prio('price')], budget: { min: 0, max: 30_000_000, type: 'under' }, budgetStated: 30_000_000 }))
    expect(cheap.ranked[0].candidate.name).toBe('B')
  })
})

describe('RANK-02 — hard budget filter (owner Decision 3: FILTER, never demote)', () => {
  const CANDIDATES: Candidate[] = [
    { id: '25', name: 'P25', domain: 'shopping', attrs: { priceVnd: 25_000_000, rating: 4.0 }, link: 'https://s/25', raw: {} },
    { id: '29', name: 'P29', domain: 'shopping', attrs: { priceVnd: 29_000_000, rating: 4.9 }, link: 'https://s/29', raw: {} },
    { id: '31', name: 'P31', domain: 'shopping', attrs: { priceVnd: 31_000_000, rating: 5.0 }, link: 'https://s/31', raw: {} },
    { id: '45', name: 'P45', domain: 'shopping', attrs: { priceVnd: 45_000_000, rating: 5.0 }, link: 'https://s/45', raw: {} },
  ]
  const need = profile({ domain: 'shopping', budget: { min: 0, max: 30_000_000, type: 'under' }, budgetStated: 30_000_000 })
  const r = rankCandidates(CANDIDATES, need)

  it('removes every candidate with a KNOWN price above the maximum', () => {
    expect(r.ranked.map(x => x.candidate.name)).toEqual(expect.arrayContaining(['P25', 'P29']))
    expect(r.ranked.map(x => x.candidate.name)).not.toContain('P31')
    expect(r.ranked.map(x => x.candidate.name)).not.toContain('P45')
  })

  it('records WHY each one was removed', () => {
    expect(r.filtered.map(f => [f.candidate.name, f.filteredBy]))
      .toEqual(expect.arrayContaining([['P31', 'budget'], ['P45', 'budget']]))
  })

  it('an over-budget candidate cannot outrank an in-budget one, however good it is', () => {
    // P31 and P45 have PERFECT ratings. Demotion would still let them surface.
    expect(r.ranked.every(x => (x.candidate.attrs.priceVnd ?? 0) <= 30_000_000)).toBe(true)
  })

  it('the survivors are still ranked among themselves', () => {
    expect(r.ranked[0].candidate.name).toBe('P29') // better rating, both in budget
  })

  it('a candidate with NO known price is not filtered — missing is not over-budget', () => {
    const withUnknown = [...CANDIDATES, { id: 'u', name: 'PU', domain: 'shopping' as const, attrs: { rating: 4.1 }, link: 'https://s/u', raw: {} }]
    const rr = rankCandidates(withUnknown, need)
    expect(rr.ranked.map(x => x.candidate.name)).toContain('PU')
  })

  it('when EVERY candidate is over budget, nothing survives and the reason is explicit', () => {
    const allOver = CANDIDATES.filter(c => (c.attrs.priceVnd ?? 0) > 30_000_000)
    const rr = rankCandidates(allOver, need)
    expect(rr.ranked).toHaveLength(0)
    expect(rr.budgetFilterEmpty).toBe(true)   // caller falls back to the shipped copy
  })

  it('does NOT report budgetFilterEmpty when there was nothing to filter', () => {
    expect(rankCandidates([], need).budgetFilterEmpty).toBe(false)
  })
})

describe('RANK-03 — a must-have cannot be outranked by price', () => {
  const CANDIDATES = [
    place('Rẻ Không Wifi', { rating: 4.9, reviewCount: 9000, distanceKm: 0.1, wifi: false }),
    place('Có Wifi', { rating: 3.6, reviewCount: 40, distanceKm: 5.0, wifi: true }),
  ]
  const r = rankCandidates(CANDIDATES, profile({ mustHave: ['wifi'], priorities: [prio('price'), prio('distance')] }))

  it('the candidate that CONTRADICTS the must-have is eliminated', () => {
    expect(r.ranked.map(x => x.candidate.name)).toEqual(['Có Wifi'])
    expect(r.filtered[0].filteredBy).toBe('mustHave')
  })

  it('so a cheaper/closer/better-rated candidate cannot win by being cheaper', () => {
    expect(r.ranked[0].candidate.name).toBe('Có Wifi')
  })

  it('a candidate with UNKNOWN wifi survives — absent evidence is not a contradiction', () => {
    const unknown = [...CANDIDATES, place('Chưa Rõ', { rating: 4.4 })]
    const rr = rankCandidates(unknown, profile({ mustHave: ['wifi'] }))
    expect(rr.ranked.map(x => x.candidate.name)).toContain('Chưa Rõ')
  })

  it('and is flagged as unverified for the must-have, so the reply can hedge', () => {
    const rr = rankCandidates([place('Chưa Rõ', { rating: 4.4 })], profile({ mustHave: ['wifi'] }))
    expect(rr.ranked[0].unverifiedMustHave).toContain('wifi')
  })
})

describe('RANK-04 — determinism', () => {
  const CANDIDATES = [
    place('A', { rating: 4.5, reviewCount: 100, distanceKm: 2 }),
    place('B', { rating: 4.5, reviewCount: 100, distanceKm: 2 }),
    place('C', { rating: 4.5, reviewCount: 900, distanceKm: 2 }),
  ]
  const need = profile({ priorities: [prio('rating'), prio('distance')] })

  it('identical inputs give byte-identical output, 100 runs', () => {
    const first = JSON.stringify(rankCandidates(CANDIDATES, need))
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(rankCandidates(CANDIDATES, need))).toBe(first)
    }
  })

  it('a perfect tie breaks on a documented chain, not on input order', () => {
    const forward = rankCandidates([CANDIDATES[0], CANDIDATES[1]], need)
    const reversed = rankCandidates([CANDIDATES[1], CANDIDATES[0]], need)
    expect(forward.ranked.map(x => x.candidate.name)).toEqual(reversed.ranked.map(x => x.candidate.name))
  })

  it('review count breaks a score tie before the name does', () => {
    expect(rankCandidates(CANDIDATES, need).ranked[0].candidate.name).toBe('C')
  })
})

describe('RANK-05 — missing attributes contribute ZERO, never a penalty', () => {
  it('a candidate missing the prioritised attribute is not eliminated', () => {
    const c = [place('Có Số Liệu', { distanceKm: 3 }), place('Thiếu Số Liệu', {})]
    const r = rankCandidates(c, profile({ priorities: [prio('distance')] }))
    expect(r.ranked).toHaveLength(2)
  })

  it('the missing attribute is RECORDED, not invented', () => {
    const r = rankCandidates([place('Thiếu Số Liệu', {})], profile({ priorities: [prio('distance'), prio('rating')] }))
    expect(r.ranked[0].missing).toEqual(expect.arrayContaining(['distance', 'rating']))
  })

  it('no reason is emitted for an attribute with no evidence', () => {
    const r = rankCandidates([place('Thiếu Số Liệu', {})], profile({ priorities: [prio('distance')] }))
    expect(r.ranked[0].reasons.map(x => x.key)).not.toContain('distance')
  })

  it('missing is strictly better than contradicting, and strictly worse than matching', () => {
    const c = [place('Có', { wifi: true }), place('Chưa rõ', {}), place('Không', { wifi: false })]
    const r = rankCandidates(c, profile({ priorities: [prio('wifi')] }))
    expect(r.ranked.map(x => x.candidate.name)).toEqual(['Có', 'Chưa rõ', 'Không'])
  })

  it('a candidate with NO attributes at all still ranks, with a zero score', () => {
    const r = rankCandidates([place('Trống', {})], profile({ priorities: [prio('rating')] }))
    expect(r.ranked).toHaveLength(1)
    expect(r.ranked[0].score).toBe(0)
  })
})

describe('RANK-06 — degenerate inputs', () => {
  const need = profile({ priorities: [prio('rating')] })

  it('an empty candidate list returns an empty result, not a throw', () => {
    const r = rankCandidates([], need)
    expect(r.ranked).toEqual([])
    expect(r.filtered).toEqual([])
  })

  it('a single candidate ranks as itself', () => {
    expect(rankCandidates([place('Một', { rating: 4 })], need).ranked).toHaveLength(1)
  })

  it('every candidate filtered out leaves an empty ranking with reasons recorded', () => {
    const r = rankCandidates(
      [place('Không Wifi', { wifi: false })],
      profile({ mustHave: ['wifi'] }),
    )
    expect(r.ranked).toEqual([])
    expect(r.filtered).toHaveLength(1)
  })

  it('an empty need profile ranks on evidence alone and never throws', () => {
    const r = rankCandidates([place('A', { rating: 4.9 }), place('B', { rating: 3.1 })], profile())
    expect(r.ranked[0].candidate.name).toBe('A')
  })

  it('never throws on malformed candidates', () => {
    expect(() => rankCandidates([{ id: 'x', name: 'x', domain: 'places', attrs: {}, link: null, raw: null }], need)).not.toThrow()
  })
})

describe('RANK-07 — the ranker declines data it cannot rank', () => {
  it('candidates with no rankable attribute at all keep provider order, flagged', () => {
    // This is today's Shopping shape: title + link + snippet, nothing structured.
    // Pretending to rank it would be exactly the "provider default order dressed
    // up as consultative ranking" that §14 forbids.
    const organic: Candidate[] = ['first', 'second', 'third'].map((n, i) => ({
      id: String(i), name: n, domain: 'shopping', attrs: {}, link: `https://s/${n}`, raw: {},
    }))
    const r = rankCandidates(organic, profile({ domain: 'shopping', priorities: [prio('price')] }))
    expect(r.rankable).toBe(false)
    expect(r.ranked.map(x => x.candidate.name)).toEqual(['first', 'second', 'third'])
  })

  it('reports rankable=true as soon as ONE candidate carries evidence', () => {
    const mixed = [place('Trống', {}), place('Có', { rating: 4.2 })]
    expect(rankCandidates(mixed, profile({ priorities: [prio('rating')] })).rankable).toBe(true)
  })
})

describe('dietary exclusion is hard, but only against real evidence', () => {
  it('a place explicitly NOT vegetarian is eliminated when the user is vegetarian', () => {
    const r = rankCandidates(
      [place('Quán Chay', { vegetarian: true }), place('Quán Thịt', { vegetarian: false })],
      profile({ avoid: ['non-vegetarian'] }),
    )
    expect(r.ranked.map(x => x.candidate.name)).toEqual(['Quán Chay'])
    expect(r.filtered[0].filteredBy).toBe('avoid')
  })

  it('a place with UNKNOWN diet data survives but is flagged unverified', () => {
    // OSM carries diet tags on a small minority of venues. Filtering on absence
    // would eliminate almost every real restaurant — and prompt rule R20 already
    // says to state uncertainty rather than assert. So: keep, and mark.
    const r = rankCandidates([place('Chưa Rõ', { rating: 4.5 })], profile({ avoid: ['non-vegetarian'] }))
    expect(r.ranked).toHaveLength(1)
    expect(r.ranked[0].unverifiedAvoid).toContain('non-vegetarian')
  })
})

describe('the ranker consumes a real derived profile end to end', () => {
  it('a Vietnamese two-turn conversation ranks places by what was actually said', () => {
    const need = deriveNeedProfile([
      { role: 'user', content: 'Tìm quán cafe ở Quận 1' },
      { role: 'assistant', content: 'Đây là vài quán.' },
      { role: 'user', content: 'Chỗ nào gần hơn' },
    ])
    const r = rankCandidates(
      [place('Xa', { rating: 4.9, distanceKm: 8 }), place('Gần', { rating: 4.1, distanceKm: 0.5 })],
      need,
    )
    expect(r.ranked[0].candidate.name).toBe('Gần')
  })
})
