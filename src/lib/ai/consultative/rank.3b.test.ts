// Phase 3B — deterministic ranking for PLACES (docs/audit/PHASE-3-ARCHITECTURE-LOCK.md §3.1, owner decisions D4 / D5 / D6 / D7 / D8).
// Non-places behaviour is pinned in rank.test.ts / hotelRanking.test.ts / transportRanking.test.ts; here only its separation is asserted.
// Benchmark V1 numbers appear only as locked acceptance examples (A01); no formula is fitted to them.
import { describe, it, expect } from 'vitest'
import { deriveNeedProfile, W_PREFERENCE, type NeedProfile } from './needProfile'
import { rankCandidates, type RankedResult } from './rank'
import { derivePick, derivePickOrState } from './pick'
import { normalizePlaces, type Candidate, type CandidateAttrs } from './candidate'

const need = (...texts: string[]): NeedProfile => deriveNeedProfile(texts.map(content => ({ role: 'user', content })))
const P = (name: string, attrs: CandidateAttrs, domain: Candidate['domain'] = 'places'): Candidate => ({ id: `id-${name}`, name, domain, attrs, link: null, raw: {} })
const names = (r: RankedResult) => r.ranked.map(e => e.candidate.name)
const entry = (r: RankedResult, n: string) => r.ranked.find(e => e.candidate.name === n)!
const perms = <T,>(a: T[]): T[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]))
const keysOf = (e: { reasons: Array<{ key: string }> }) => e.reasons.map(r => r.key)

// A01-shaped set (locked Benchmark V1 numbers): price band bound in VND, rating, distance.
const A01 = () => [
  P('A', { priceHighVnd: 80_000, distanceKm: 2, rating: 4.2, reviewCount: 100 }),
  P('B', { priceHighVnd: 150_000, distanceKm: 1, rating: 4.8, reviewCount: 100 }),
  P('C', { priceHighVnd: 110_000, distanceKm: 4, rating: 4.5, reviewCount: 100 }),
]

describe('A. hard budget eliminates before ranking', () => {
  const n = need('Ngân sách dưới 300k.')
  const set = () => [P('Rẻ', { priceHighVnd: 280_000, rating: 4.3 }), P('Đắt', { priceHighVnd: 450_000, rating: 4.8 }), P('Giữa', { priceHighVnd: 320_000, rating: 4.6 })]
  it('above-budget places are filtered, never ranked, never the Pick', () => {
    const r = rankCandidates(set(), n)
    expect(r.filtered.map(f => f.candidate.name).sort()).toEqual(['Giữa', 'Đắt'])
    expect(r.filtered.every(f => f.filteredBy === 'budget')).toBe(true)
    expect(names(r)).toEqual(['Rẻ'])
    expect(derivePick(r, n)).toBeNull() // one survivor is an answer, not a choice
  })
  it('"không quá", "tối đa" and "under" are hard too; a place at exactly the limit survives', () => {
    for (const s of ['không quá 300k', 'tối đa 300k', 'under 300k']) {
      const r = rankCandidates([P('Vừa', { priceHighVnd: 300_000, rating: 4 }), P('Quá', { priceHighVnd: 300_001, rating: 5 })], need(s))
      expect(names(r), s).toEqual(['Vừa'])
    }
  })
  it('every candidate eliminated → explicit state all_eliminated, no forced Pick', () => {
    const r = rankCandidates([P('X', { priceHighVnd: 900_000, rating: 4 }), P('Y', { priceHighVnd: 800_000, rating: 5 })], n)
    expect(r.ranked).toEqual([])
    expect(derivePickOrState(r, n)).toEqual({ pick: null, state: 'all_eliminated' })
  })
})

describe('B/C/D/E. soft budget ("khoảng / tầm / around") is an ORDERING TIER, never an elimination', () => {
  const set = () => [
    P('Trên', { priceHighVnd: 400_000, rating: 4.9, reviewCount: 100 }),
    P('Trong', { priceHighVnd: 250_000, rating: 4.0, reviewCount: 100 }),
    P('Chưa rõ giá', { rating: 4.5, reviewCount: 100 }),
  ]
  it('B. no explicit priority: within budget first, then unknown price, then above — BEFORE the numeric score', () => {
    const r = rankCandidates(set(), need('khoảng 300k'))
    expect(names(r)).toEqual(['Trong', 'Chưa rõ giá', 'Trên'])
    expect(r.ranked.map(e => e.budgetTier)).toEqual(['within', 'unknown', 'above'])
    expect(r.filtered).toEqual([])
    // the above-budget place has the strictly highest score, and is still ordered last: the tier is not a score term
    expect(entry(r, 'Trên').score).toBeGreaterThan(entry(r, 'Trong').score)
    expect(r.ranked.every(e => !keysOf(e).includes('priceBand') && !keysOf(e).includes('price'))).toBe(true)
  })
  it('B. unknown price is recorded, never a penalty and never inferred', () => {
    const r = rankCandidates(set(), need('tầm 300k'))
    expect(entry(r, 'Chưa rõ giá').missing).toContain('price')
    expect(entry(r, 'Chưa rõ giá').score).toBeGreaterThan(0)
  })
  it('B. with nothing within budget, an above-budget place is still eligible and is the Pick', () => {
    const above = [P('Trên 1', { priceHighVnd: 400_000, rating: 4.9, reviewCount: 100 }), P('Trên 2', { priceHighVnd: 500_000, rating: 4.1, reviewCount: 100 })]
    const n = need('khoảng 300k')
    const r = rankCandidates(above, n)
    expect(names(r)).toEqual(['Trên 1', 'Trên 2'])
    expect(derivePick(r, n)!.candidate.name).toBe('Trên 1')
  })
  it('B. soft "around" is NOT the old ±20 % elimination: a place at 1.5x the stated amount stays', () => {
    const r = rankCandidates([P('Gấp rưỡi', { priceHighVnd: 450_000, rating: 4 }), P('Vừa', { priceHighVnd: 290_000, rating: 4 })], need('khoảng 300k'))
    expect(r.filtered).toEqual([])
    expect(names(r)).toHaveLength(2)
  })
  it('C. an explicit competing priority governs: an above-budget place may outrank an in-budget one; the tier is only a tie-level key', () => {
    const n = need('ưu tiên chất lượng, khoảng 300k')
    const r = rankCandidates(set(), n)
    expect(names(r)[0]).toBe('Trên') // quality priority, 4.9
    // equal on the priority: the tier orders them
    const tie = rankCandidates([P('Cao giá', { priceHighVnd: 400_000, rating: 4.5 }), P('Hợp giá', { priceHighVnd: 250_000, rating: 4.5 })], n)
    expect(names(tie)).toEqual(['Hợp giá', 'Cao giá'])
  })
  it('D. balanced + a stated budget: price takes part through the balanced block, and the tier is absent', () => {
    const n = need('cân bằng giá và chất lượng, khoảng 300k')
    const r = rankCandidates(set(), n)
    expect(r.ranked.every(e => e.budgetTier === undefined)).toBe(true)
    expect(r.ranked.some(e => keysOf(e).includes('price'))).toBe(true)
    expect(r.filtered).toEqual([])
  })
  it('E. no budget: no tier, price inert (a dearer place with a better rating wins on rating)', () => {
    const r = rankCandidates([P('Đắt ngon', { priceHighVnd: 900_000, rating: 4.9, reviewCount: 100 }), P('Rẻ vừa', { priceHighVnd: 50_000, rating: 4.1, reviewCount: 100 })], need('Ăn trưa.'))
    expect(names(r)).toEqual(['Đắt ngon', 'Rẻ vừa'])
    expect(r.ranked.every(e => e.budgetTier === undefined && !keysOf(e).some(k => k === 'priceBand' || k === 'price'))).toBe(true)
  })
  it('a dismissed price removes the tier too (the user said price does not matter)', () => {
    const r = rankCandidates(set(), need('giá không quan trọng, khoảng 300k'))
    expect(r.ranked.every(e => e.budgetTier === undefined)).toBe(true)
  })
})

describe('F. price-path exclusivity: exactly ONE price path per request', () => {
  const scenarios: Array<[string, string[], string]> = [
    ['default + soft budget → tier only', ['khoảng 300k'], 'tier'],
    ['explicit non-price priority + soft budget → tier only (tie level)', ['ưu tiên chất lượng, khoảng 300k'], 'tier'],
    ['explicit price priority + soft budget → priceBand only', ['ưu tiên tiết kiệm, khoảng 300k'], 'score'],
    ['explicit price priority, no budget → priceBand (set-relative) only', ['Giá quan trọng.'], 'score'],
    ['balanced with a stated budget → balanced price only', ['cân bằng giá và chất lượng, khoảng 300k'], 'score'],
    ['balanced naming price, no budget → balanced price only', ['cân bằng giá và chất lượng'], 'score'],
    ['hard budget + price priority → priceBand only', ['ưu tiên tiết kiệm, dưới 400k'], 'score'],
  ]
  const set = () => [P('A', { priceHighVnd: 250_000, rating: 4.0 }), P('B', { priceHighVnd: 350_000, rating: 4.4 }), P('C', { priceHighVnd: 100_000, rating: 4.2 })]
  it.each(scenarios)('%s', (_label, texts, path) => {
    const r = rankCandidates(set(), need(...texts))
    expect(r.ranked.length).toBeGreaterThan(0)
    for (const e of r.ranked) {
      const scored = e.reasons.some(x => x.key === 'priceBand' || x.key === 'price') ? 1 : 0
      const tier = e.budgetTier ? 1 : 0
      expect(scored + tier, e.candidate.name).toBeLessThanOrEqual(1)
      if (path === 'score') expect(tier).toBe(0)
      if (path === 'tier') expect(scored).toBe(0)
    }
  })
  it('a price carried by a score never also gets a tier, even for a candidate whose band is unknown', () => {
    const r = rankCandidates([P('A', { priceHighVnd: 250_000, rating: 4 }), P('B', { rating: 4.4 })], need('ưu tiên tiết kiệm, khoảng 300k'))
    expect(r.ranked.every(e => e.budgetTier === undefined)).toBe(true)
  })
})

describe('G. review-count exclusivity', () => {
  const two = () => [P('Nhiều review', { rating: 4.5, reviewCount: 5000, distanceKm: 2 }), P('Ít review', { rating: 4.5, reviewCount: 10, distanceKm: 2 })]
  it('places default: review count is a SCORE term (existing weight), and nowhere else', () => {
    const r = rankCandidates(two(), need('Ăn trưa.'))
    expect(keysOf(entry(r, 'Nhiều review'))).toContain('reviewCount')
    expect(names(r)).toEqual(['Nhiều review', 'Ít review'])
  })
  it('explicit priority: review count is not a score term; it is only the tie key', () => {
    const r = rankCandidates(two(), need('ưu tiên gần'))
    expect(r.ranked.some(e => keysOf(e).includes('reviewCount'))).toBe(false)
    expect(entry(r, 'Nhiều review').score).toBe(entry(r, 'Ít review').score)
    expect(names(r)).toEqual(['Nhiều review', 'Ít review']) // reviews key breaks the exact tie
  })
  it('balanced: review count is not a score term', () => {
    const r = rankCandidates(two(), need('cân bằng chất lượng và khoảng cách'))
    expect(r.ranked.some(e => keysOf(e).includes('reviewCount'))).toBe(false)
  })
  it('default mode: an exact score tie falls to the NAME (the reviews are already in the score)', () => {
    const r = rankCandidates([P('Zeta', { rating: 4.5, reviewCount: 100 }), P('Alpha', { rating: 4.5, reviewCount: 100 })], need('Ăn trưa.'))
    expect(names(r)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('H/I/J/K. balanced mode — set-relative min-max, survivors only, missing = 0', () => {
  const n = need('Ăn trưa, muốn cân bằng giá và chất lượng.')
  it('H. equal weight over the stated criteria only, each min-max over the set (A01 is an acceptance check, not a tuning target)', () => {
    const r = rankCandidates(A01(), n)
    // price (lower better): A 1, B 0, C 40/70 ; rating (higher better): A 0, B 1, C 0.5
    expect(entry(r, 'A').score).toBeCloseTo(1, 10)
    expect(entry(r, 'B').score).toBeCloseTo(1, 10)
    expect(entry(r, 'C').score).toBeCloseTo(40 / 70 + 0.5, 10)
    expect(names(r)[0]).toBe('C')
    // nothing else takes part: no distance, no reviews
    for (const e of r.ranked) expect(keysOf(e).every(k => k === 'price' || k === 'rating')).toBe(true)
  })
  it('H. a counter-case: the middle candidate does not win by construction', () => {
    const r = rankCandidates([P('A', { priceHighVnd: 100_000, rating: 4.9 }), P('B', { priceHighVnd: 200_000, rating: 4.0 }), P('C', { priceHighVnd: 150_000, rating: 4.1 })], n)
    expect(names(r)[0]).toBe('A')
  })
  it('I. the normalisation population is the hard-filter SURVIVORS: an eliminated extreme moves no value', () => {
    const withBudget = need('cân bằng giá và chất lượng, dưới 500k')
    const base = rankCandidates(A01(), withBudget)
    const withExtreme = rankCandidates([...A01(), P('Cực đắt', { priceHighVnd: 900_000, rating: 5.0 })], withBudget)
    expect(withExtreme.filtered.map(f => f.candidate.name)).toEqual(['Cực đắt'])
    for (const e of base.ranked) expect(entry(withExtreme, e.candidate.name).score).toBeCloseTo(e.score, 10)
  })
  it('J. missing evidence contributes exactly 0 (never negative), is recorded, and is not in the min-max range', () => {
    const r = rankCandidates([...A01(), P('Thiếu giá', { rating: 4.5 })], n)
    const m = entry(r, 'Thiếu giá')
    expect(m.missing).toContain('price')
    expect(m.score).toBeCloseTo(0.5, 10) // its rating term only; the price term is exactly 0
    expect(m.reasons.every(x => x.contribution > 0)).toBe(true)
    expect(entry(r, 'A').score).toBeCloseTo(1, 10) // the known values' scale did not move
  })
  it('J. a missing value is never turned into a fact: no price reason, and no price evidence on the candidate', () => {
    const r = rankCandidates([...A01(), P('Thiếu giá', { rating: 4.5 })], n)
    expect(keysOf(entry(r, 'Thiếu giá'))).not.toContain('price')
    expect(entry(r, 'Thiếu giá').candidate.attrs.priceHighVnd).toBeUndefined()
  })
  it('K. fewer than two known values: no scaling, the criterion contributes 0', () => {
    const r = rankCandidates([P('A', { priceHighVnd: 100_000, rating: 4.5 }), P('B', { rating: 4.0 }), P('C', { rating: 4.8 })], need('muốn cân bằng giá và chất lượng'))
    // price known for ONE candidate only → price is 0 for everyone; rating is scaled over its three known values
    for (const e of r.ranked) expect(keysOf(e)).not.toContain('price')
    expect(entry(r, 'B').missing).toContain('price')
    expect(entry(r, 'A').missing).not.toContain('price') // it HAS the value; there is just nothing to scale against
    expect(entry(r, 'C').score).toBeCloseTo(1, 10)
  })
  it('zero spread contributes the same to everyone (no division by zero)', () => {
    const r = rankCandidates([P('A', { priceHighVnd: 100_000, rating: 4.5 }), P('B', { priceHighVnd: 100_000, rating: 4.0 })], n)
    for (const e of r.ranked) expect(Number.isFinite(e.score)).toBe(true)
    expect(entry(r, 'A').score).toBeCloseTo(1, 10)
  })
  it('the stated criteria only: "cân bằng chất lượng và khoảng cách" never adds price', () => {
    const r = rankCandidates(A01(), need('cân bằng chất lượng và khoảng cách'))
    for (const e of r.ranked) expect(keysOf(e).every(k => k === 'rating' || k === 'distance')).toBe(true)
  })
})

describe('L/M. explicit priorities: the default block is off, each priority scores with its OWN existing weight', () => {
  it('L. a stated distance priority: the nearer place wins whatever its rating; rating and reviews take no part', () => {
    const r = rankCandidates([P('Gần', { distanceKm: 0.5, rating: 3.5, reviewCount: 10 }), P('Xa', { distanceKm: 6, rating: 4.9, reviewCount: 9000 })], need('ưu tiên gần'))
    expect(names(r)).toEqual(['Gần', 'Xa'])
    for (const e of r.ranked) expect(keysOf(e)).toEqual(['distance'])
  })
  it('L. the contribution is the stated weight times the evidence (no LLM, no new constant)', () => {
    const n = need('ưu tiên gần')
    const w = n.priorities.find(p => p.key === 'distance')!.weight
    const r = rankCandidates([P('A', { distanceKm: 2 }), P('B', { distanceKm: 4 })], n)
    expect(entry(r, 'A').score).toBeCloseTo(w * 0.8, 10)
  })
  it('L. a price priority with no budget uses the band bound relative to the dearest KNOWN band in the set', () => {
    const r = rankCandidates([P('Rẻ', { priceHighVnd: 80_000, rating: 4 }), P('Đắt', { priceHighVnd: 180_000, rating: 4.8 })], need('Giá quan trọng.'))
    expect(names(r)).toEqual(['Rẻ', 'Đắt'])
    expect(keysOf(entry(r, 'Rẻ'))).toEqual(['priceBand'])
  })
  it('L. a quality priority with a price dismissed: quality decides', () => {
    const r = rankCandidates([P('Rẻ', { priceHighVnd: 80_000, rating: 4 }), P('Đắt', { priceHighVnd: 180_000, rating: 4.8 })], need('Ăn ngon quan trọng, giá không quá quan trọng.'))
    expect(names(r)).toEqual(['Đắt', 'Rẻ'])
  })
  it('M. several priorities that are not balanced: the existing weights of each stated key, nothing new', () => {
    const n = need('ưu tiên giá, ưu tiên chất lượng')
    const r = rankCandidates(A01(), n)
    const weights = new Map(n.priorities.map(p => [p.key, p.weight]))
    for (const e of r.ranked) for (const x of e.reasons) expect(Math.abs(x.contribution)).toBeLessThanOrEqual((weights.get(x.key === 'priceBand' ? 'price' : x.key) ?? 0) + 1e-9)
    expect(n.tradeoff).toBeUndefined()
  })
})

describe('N/O. household (D8): soft context counts only with candidate evidence; hard only on mandatory wording', () => {
  const set = () => [
    P('Có bằng chứng', { rating: 4.5, reviewCount: 100, familyFriendly: true }),
    P('Không rõ', { rating: 4.5, reviewCount: 100 }),
    P('Không hợp', { rating: 4.5, reviewCount: 100, familyFriendly: false }),
  ]
  it('N. "đi với bé": nobody is eliminated; evidence for > unknown > evidence against; the effect is the existing soft weight', () => {
    const r = rankCandidates(set(), need('Đi với bé 3 tuổi'))
    expect(r.filtered).toEqual([])
    expect(names(r)).toEqual(['Có bằng chứng', 'Không rõ', 'Không hợp'])
    expect(entry(r, 'Có bằng chứng').score - entry(r, 'Không rõ').score).toBeCloseTo(W_PREFERENCE, 10)
    expect(entry(r, 'Không rõ').score - entry(r, 'Không hợp').score).toBeCloseTo(W_PREFERENCE, 10)
  })
  it('N. an unknown suitability is recorded as unknown, never filled in', () => {
    const r = rankCandidates(set(), need('Đi với bé 3 tuổi'))
    expect(entry(r, 'Không rõ').missing).toContain('family_friendly')
    expect(entry(r, 'Không rõ').candidate.attrs.familyFriendly).toBeUndefined()
  })
  it('N. the user mentioning a child is not evidence: with no supplied attribute the ranking is exactly the one without the mention', () => {
    const plain = [P('A', { rating: 4.6, reviewCount: 100 }), P('B', { rating: 4.4, reviewCount: 100 })]
    const a = rankCandidates(plain, need('Ăn trưa'))
    const b = rankCandidates(plain, need('Ăn trưa, đi với bé'))
    expect(names(b)).toEqual(names(a))
    for (const e of a.ranked) expect(entry(b, e.candidate.name).score).toBeCloseTo(e.score, 10)
  })
  it('O. mandatory wording: CONTRADICTING evidence eliminates; unknown stays eligible and is flagged', () => {
    const r = rankCandidates(set(), need('Bắt buộc phù hợp cho bé.'))
    expect(r.filtered).toEqual([{ candidate: expect.objectContaining({ name: 'Không hợp' }), filteredBy: 'mustHave' }])
    expect(names(r)).toEqual(expect.arrayContaining(['Có bằng chứng', 'Không rõ']))
    expect(entry(r, 'Không rõ').unverifiedMustHave).toContain('family_friendly')
    expect(entry(r, 'Có bằng chứng').unverifiedMustHave).toEqual([])
  })
  it('O. other registry constraints follow the same policy (helmet must-have, spicy avoid)', () => {
    const rent = rankCandidates([P('Có mũ', { priceHighVnd: 100_000, helmetIncluded: true }), P('Không mũ', { priceHighVnd: 70_000, helmetIncluded: false }), P('Chưa rõ mũ', { priceHighVnd: 90_000 })], need('Muốn rẻ nhưng bắt buộc có mũ.'))
    expect(rent.filtered.map(f => f.candidate.name)).toEqual(['Không mũ'])
    expect(entry(rent, 'Chưa rõ mũ').unverifiedMustHave).toContain('helmet_included')
    const food = rankCandidates([P('Cay', { rating: 4.8, spicy: true }), P('Không cay', { rating: 4.0, spicy: false }), P('Chưa rõ', { rating: 4.2 })], need('Muốn món Việt và không ăn cay.'))
    expect(food.filtered.map(f => f.candidate.name)).toEqual(['Cay'])
    expect(entry(food, 'Chưa rõ').unverifiedAvoid).toContain('spicy')
  })
})

describe('P. supplied attributes outside the old whitelist reach the ranking layer — with source, never invented', () => {
  const rows = { results: [
    { name: 'X', maps_link: 'https://m/x', family_friendly: true, spicy: false, helmet_included: true },
    { name: 'Y', maps_link: 'https://m/y' },
    { name: 'Z', maps_link: 'https://m/z', family_friendly: 'yes', spicy: 1 },
  ] }
  const c = normalizePlaces(rows)
  it('a boolean the row supplied becomes an attribute and an evidence entry with its source', () => {
    expect(c[0].attrs).toMatchObject({ familyFriendly: true, spicy: false, helmetIncluded: true })
    expect(c[0].evidence).toEqual([
      { id: 'family_friendly', value: true, source: 'row.family_friendly', kind: 'FACT' },
      { id: 'spicy', value: false, source: 'row.spicy', kind: 'FACT' },
      { id: 'helmet_included', value: true, source: 'row.helmet_included', kind: 'FACT' },
    ])
  })
  it('absent stays UNKNOWN (undefined, not false); a non-boolean is not evidence', () => {
    expect(c[1].attrs.familyFriendly).toBeUndefined()
    expect(c[1].evidence).toBeUndefined()
    expect(c[2].attrs.familyFriendly).toBeUndefined()
    expect(c[2].attrs.spicy).toBeUndefined()
  })
  it('nothing is inferred from a name: a venue called "Gia Đình" carries no family evidence', () => {
    expect(normalizePlaces({ results: [{ name: 'Nhà hàng Gia Đình', maps_link: 'https://m/g' }] })[0].attrs.familyFriendly).toBeUndefined()
  })
})

describe('Q/R. the D6 chain score → reviews → name, and candidate-order invariance', () => {
  const modes: Array<[string, string, () => Candidate[]]> = [
    ['default', 'Ăn trưa.', () => [P('C', { rating: 4.5, reviewCount: 100 }), P('A', { rating: 4.5, reviewCount: 100 }), P('B', { rating: 4.7, reviewCount: 20 })]],
    ['default + soft budget', 'khoảng 300k', () => [P('C', { priceHighVnd: 200_000, rating: 4.5, reviewCount: 100 }), P('A', { priceHighVnd: 200_000, rating: 4.5, reviewCount: 100 }), P('B', { priceHighVnd: 500_000, rating: 4.9, reviewCount: 20 })]],
    ['explicit', 'ưu tiên gần', () => [P('C', { distanceKm: 2, reviewCount: 10 }), P('A', { distanceKm: 2, reviewCount: 500 }), P('B', { distanceKm: 1, reviewCount: 1 })]],
    ['balanced', 'cân bằng giá và chất lượng', () => [P('C', { priceHighVnd: 100_000, rating: 4.5 }), P('A', { priceHighVnd: 100_000, rating: 4.5 }), P('B', { priceHighVnd: 200_000, rating: 4.9 })]],
  ]
  it.each(modes)('R. %s: every input order gives the same ranking and the same Pick', (_m, text, build) => {
    const n = need(text)
    const first = rankCandidates(build(), n)
    const pick = derivePick(first, n, { explicitChoiceRequest: true })?.candidate.name ?? null
    for (const order of perms(build())) {
      const r = rankCandidates(order, n)
      expect(names(r)).toEqual(names(first))
      expect(derivePick(r, n, { explicitChoiceRequest: true })?.candidate.name ?? null).toBe(pick)
    }
  })
  it('Q. explicit mode: equal score → more reviews → name', () => {
    const r = rankCandidates([P('Z', { distanceKm: 2, reviewCount: 500 }), P('B', { distanceKm: 2, reviewCount: 10 }), P('A', { distanceKm: 2, reviewCount: 10 })], need('ưu tiên gần'))
    expect(names(r)).toEqual(['Z', 'A', 'B'])
  })
  it('Q. identical names fall back to the stable id, never to input order', () => {
    const a = P('Same', { rating: 4.5, reviewCount: 10 }); a.id = 'id-2'
    const b = P('Same', { rating: 4.5, reviewCount: 10 }); b.id = 'id-1'
    expect(rankCandidates([a, b], need('Ăn trưa.')).ranked.map(e => e.candidate.id)).toEqual(['id-1', 'id-2'])
    expect(rankCandidates([b, a], need('Ăn trưa.')).ranked.map(e => e.candidate.id)).toEqual(['id-1', 'id-2'])
  })
})

describe('S/T. the Pick: deterministic, authoritative, explicit when there is none', () => {
  it('T. a clear lead is `unique`, a narrow one `conditional` (the existing PICK_MARGIN, unchanged), an exact tie `tie_rule`', () => {
    const n = need('ưu tiên gần')
    expect(derivePick(rankCandidates([P('A', { distanceKm: 0.5 }), P('B', { distanceKm: 8 })], n), n)!.reason).toBe('unique')
    expect(derivePick(rankCandidates([P('A', { distanceKm: 1.95 }), P('B', { distanceKm: 2 })], n), n)!.reason).toBe('conditional')
    expect(derivePick(rankCandidates([P('A', { distanceKm: 2 }), P('B', { distanceKm: 2 })], n), n)!.reason).toBe('tie_rule')
  })
  it('T. the Pick is rank[0] of the deterministic ranking (the model is not the source of identity)', () => {
    const n = need('ưu tiên gần')
    const r = rankCandidates([P('Xa', { distanceKm: 6 }), P('Gần', { distanceKm: 0.4 })], n)
    expect(derivePick(r, n)!.candidate).toBe(r.ranked[0].candidate)
  })
  it('S. fewer than two candidates → no Pick and no state (an answer, not a choice)', () => {
    const n = need('ưu tiên gần')
    expect(derivePickOrState(rankCandidates([P('Một', { distanceKm: 1 })], n), n)).toEqual({ pick: null, state: null })
  })
  it('S. nothing to decide on → no Pick, state no_evidence (the existing null conditions; no new threshold)', () => {
    const n = need('ưu tiên gần')
    const r = rankCandidates([P('A', {}), P('B', {})], n)
    expect(derivePickOrState(r, n)).toEqual({ pick: null, state: 'no_evidence' })
    const noNeed = need('xin chào')
    expect(derivePickOrState(rankCandidates([P('A', { rating: 4 }), P('B', { rating: 3 })], noNeed), noNeed).state).toBe('no_evidence')
  })
  it('S. all candidates eliminated by a hard constraint → all_eliminated, never a forced candidate', () => {
    const n = need('Bắt buộc phù hợp cho bé.')
    const r = rankCandidates([P('A', { rating: 4, familyFriendly: false }), P('B', { rating: 5, familyFriendly: false })], n)
    expect(derivePickOrState(r, n)).toEqual({ pick: null, state: 'all_eliminated' })
  })
})

describe('U. places vs non-places: the 3B rules apply to places candidates only', () => {
  const hotels = () => [
    P('Gần', { priceVnd: 1_150_000, stars: 4, distanceKm: 1 }, 'hotel'),
    P('Xa', { priceVnd: 1_300_000, stars: 5, distanceKm: 9 }, 'hotel'),
    P('Rẻ', { priceVnd: 900_000, stars: 3, distanceKm: 3 }, 'hotel'),
  ]
  it('a non-places set keeps the legacy "around" band: ±20 % still eliminates (priceVnd), the tier does not exist', () => {
    const r = rankCandidates(hotels(), need('khoảng 1 triệu'))
    expect(r.filtered.map(f => f.candidate.name)).toEqual(['Xa'])
    expect(r.ranked.every(e => e.budgetTier === undefined)).toBe(true)
  })
  it('a non-places set keeps its default distance weight and its review key (no places default rules)', () => {
    const r = rankCandidates([P('Gần', { distanceKm: 0.5, rating: 4 }, 'hotel'), P('Xa', { distanceKm: 9, rating: 4 }, 'hotel')], need('Ăn trưa'))
    expect(keysOf(entry(r, 'Gần'))).toContain('distance')
  })
  it('the same attributes on a PLACE leave distance inert in the default (BM §15: nothing invented)', () => {
    const r = rankCandidates([P('Gần', { distanceKm: 0.5, rating: 4 }), P('Xa', { distanceKm: 9, rating: 4 })], need('Ăn trưa'))
    expect(keysOf(entry(r, 'Gần'))).not.toContain('distance')
  })
  it('a mixed set is treated as non-places (the legacy path), never half-and-half', () => {
    const r = rankCandidates([P('P', { distanceKm: 1, rating: 4 }), P('H', { distanceKm: 1, rating: 4 }, 'hotel')], need('Ăn trưa'))
    expect(keysOf(entry(r, 'P'))).toContain('distance')
  })
})
