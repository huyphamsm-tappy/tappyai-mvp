// Consultative final fix — regression tests for the defects Benchmark V1 (docs/audit/BENCHMARK-V1-FULL-RESULTS.md) demonstrated.
// Benchmark numbers appear only as acceptance examples; no formula is fitted to them and no benchmark text is changed.
import { describe, it, expect } from 'vitest'
import { deriveNeedProfile, extractBudgetBilingual, extractBudgetRefinement, type NeedProfile } from './needProfile'
import { extractBudget, parseMoneyAmount } from '../budget'
import { rankCandidates, type RankedResult } from './rank'
import { derivePick, derivePickOrState } from './pick'
import { restrictRankedTo } from './shortlist'
import { qualifiesFor } from './decisionFrame'
import { trimPlacesForModel } from './modelPayload'
import { mergeIntentWithRules } from './luna'
import { routeConsult } from './consultRouter'
import type { ConsultDecision } from './consultBrain'
import type { Candidate, CandidateAttrs } from './candidate'

const conv = (...u: string[]) => u.map(content => ({ role: 'user', content }))
const need = (...u: string[]): NeedProfile => deriveNeedProfile(conv(...u))
const P = (name: string, attrs: CandidateAttrs, domain: Candidate['domain'] = 'places', id?: string): Candidate => ({ id: id ?? `id-${name}`, name, domain, attrs, link: null, raw: {} })
const names = (r: RankedResult) => r.ranked.map(e => e.candidate.name)
const perms = <T,>(a: T[]): T[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]))

// ── A. budget increment / update ────────────────────────────────────────────────────────────────────────────────────────────────
describe('A. a clear change of the available budget updates the active budget', () => {
  it('"Có thể lên 300k nếu đáng" after a ceiling raises the ceiling (benchmark B04 turn 2)', () => {
    const p = need('Ngân sách dưới 200k.', 'Có thể lên 300k nếu đáng.')
    expect(p.budget).toEqual({ min: 0, max: 300_000, type: 'under' })
    expect(p.budgetStated).toBe(300_000)
    expect(p.changedAtTurn.budget).toBe(2)
  })
  it('the explicit phrasing keeps working ("tăng ngân sách lên 500k")', () => {
    expect(need('Ngân sách dưới 300k.', 'Có thể tăng ngân sách lên 500k.').budget).toEqual({ min: 0, max: 500_000, type: 'under' })
  })
  it('natural-language replacement, increase and decrease: new absolute amount', () => {
    for (const [first, next, max] of [
      ['Ngân sách dưới 500k.', 'nâng lên 700k', 700_000], ['Ngân sách dưới 500k.', 'xuống 200k thôi', 200_000], ['Ngân sách dưới 500k.', 'giảm còn 350k', 350_000],
      ['Ngân sách dưới 500k.', 'đổi thành 400k', 400_000], ['Ngân sách dưới 500k.', 'lên 1 triệu', 1_000_000],
    ] as const) expect(need(first, next).budget?.max, next).toBe(max)
  })
  it('a decimal amount before a scale unit is a decimal, not thousands ("1.3 triệu" = 1,300,000; it was 13,000,000)', () => {
    expect(need('Ngân sách dưới 1 triệu.', 'Có thể lên 1.3 triệu.').budget?.max).toBe(1_300_000)
    expect(need('Ngân sách khoảng 800k.', 'Có thể lên 1.2 triệu.').budgetStated).toBe(1_200_000)
    expect(extractBudget('ngân sách 1.3 triệu')?.max).toBe(1_300_000)
    expect(extractBudget('ngân sách 1,3 triệu')?.max).toBe(1_300_000)
    expect(extractBudget('ngân sách khoảng 1.5tr')).toEqual({ min: 1_200_000, max: 1_800_000, type: 'around' })
    expect(extractBudget('ngân sách 2.5k')?.max).toBe(2_500)
    expect(parseMoneyAmount('1.300.000', '')).toBe(1_300_000) // thousands groups are untouched
    expect(parseMoneyAmount('1.300', 'k')).toBe(1_300_000) // three digits after the dot stay a thousands group
    expect(parseMoneyAmount('1,5', 'tr')).toBe(1_500_000)
  })
  it('a relative change applies to the current amount ("thêm 100k", "bớt 100k")', () => {
    expect(need('Ngân sách dưới 500k.', 'thêm 100k nữa').budget?.max).toBe(600_000)
    expect(need('Ngân sách dưới 500k.', 'bớt 100k').budget?.max).toBe(400_000)
  })
  it('a SOFT budget stays soft ("khoảng" → the new amount is the new midpoint, ±20 %); a ceiling stays a ceiling', () => {
    const soft = need('Ngân sách khoảng 300k.', 'Có thể lên 400k.')
    expect(soft.budget).toEqual({ min: 320_000, max: 480_000, type: 'around' })
    expect(soft.budgetStated).toBe(400_000)
    expect(need('Ngân sách dưới 300k.', 'Có thể lên 400k.').budget?.type).toBe('under')
    expect(need('Ngân sách khoảng 300k.', 'thêm 100k nữa').budget).toEqual({ min: 320_000, max: 480_000, type: 'around' })
  })
  it('English: "we can go to 700k", "lower it to 300k"; "increase … to" is still read by the existing form', () => {
    expect(need('Ngân sách dưới 500k.', 'we can go to 700k').budget?.max).toBe(700_000)
    expect(need('Ngân sách dưới 500k.', 'lower it to 300k').budget?.max).toBe(300_000)
    expect(extractBudgetBilingual('increase my budget to 35M')?.budget.max).toBe(35_000_000)
  })
  it('safe: no earlier budget, no money unit, or a non-money number never becomes a budget', () => {
    expect(need('Tìm quán ăn.', 'Có thể lên 300k nếu đáng.').budget).toBeNull()
    expect(need('Ngân sách dưới 500k.', 'lên tầng 3 nhé').budget?.max).toBe(500_000)
    expect(need('Ngân sách dưới 500k.', 'Thêm 2 người nữa').budget?.max).toBe(500_000)
    expect(extractBudgetRefinement('lên 300k', null, null)).toBeNull()
  })
  it('a new budget STATEMENT still wins over a refinement reading ("ngân sách dưới 200k")', () => {
    expect(need('Ngân sách khoảng 300k.', 'Ngân sách dưới 200k.').budget).toEqual({ min: 0, max: 200_000, type: 'under' })
  })
  it('hard vs soft meaning survives into ranking: the raised ceiling admits the candidate the old one eliminated (B03-shaped)', () => {
    const set = () => [P('A', { priceHighVnd: 850_000, rating: 4.1, reviewCount: 100 }), P('B', { priceHighVnd: 1_200_000, rating: 4.8, reviewCount: 100 }), P('C', { priceHighVnd: 950_000, rating: 4.5, reviewCount: 100 })]
    const t1 = rankCandidates(set(), need('Ngân sách dưới 1 triệu.'))
    expect(names(t1)[0]).toBe('C')
    expect(t1.filtered.map(f => f.candidate.name)).toEqual(['B'])
    const t2 = rankCandidates(set(), need('Ngân sách dưới 1 triệu.', 'Có thể lên 1.3 triệu.'))
    expect(names(t2)[0]).toBe('B')
    expect(t2.filtered).toEqual([])
  })
})

// ── B. superlative / extreme priority ───────────────────────────────────────────────────────────────────────────────────────────
describe('B. a superlative on one rankable axis selects the extreme candidate deterministically', () => {
  const flagged = (...u: string[]) => need(...u).priorities.filter(p => p.extreme).map(p => p.key)
  it('Vietnamese and English superlatives are read; the opposite extremes and place-feature superlatives are not', () => {
    expect(flagged('Rẻ nhất.')).toEqual(['price'])
    expect(flagged('Muốn rẻ nhất.')).toEqual(['price'])
    expect(flagged('Giá rẻ nhất')).toEqual(['price'])
    expect(flagged('Gần nhất.')).toEqual(['distance'])
    expect(flagged('Muốn chỗ gần nhất.')).toEqual(['distance'])
    expect(flagged('Chỉ cần gần nhà.')).toEqual(['distance'])
    expect(flagged('quán gần đây nhất')).toEqual(['distance'])
    expect(flagged('the cheapest place')).toEqual(['price'])
    expect(flagged('the nearest one')).toEqual(['distance'])
    expect(flagged('closest please')).toEqual(['distance'])
    expect(flagged('quán đánh giá cao nhất')).toEqual(['rating'])
    expect(flagged('the highest rated one')).toEqual(['rating'])
    // not supported by the product contract (no direction): never invented
    expect(flagged('đắt nhất')).toEqual([])
    expect(flagged('xa nhất')).toEqual([])
    // a place feature, not the distance axis
    expect(flagged('gần biển nhất')).toEqual([])
    // a weight-1 mention is NOT a superlative
    expect(flagged('Muốn tiết kiệm.')).toEqual([])
    expect(flagged('Muốn gần và tiện.')).toEqual([])
  })
  it('"nhất" (most) is not "Nhật" (Japanese): a superlative with food words carries no cuisine priority and stays a SINGLE extreme priority', () => {
    for (const [text, key] of [['quán ăn gần nhất', 'distance'], ['quán ăn rẻ nhất', 'price'], ['món ngon nhất gần đây', 'rating']] as const) {
      const keys = need(text).priorities.map(p => p.key)
      expect(keys.some(k => k.startsWith('cuisine:')), text).toBe(false)
      if (key !== 'rating') expect(keys, text).toEqual([key])
    }
    for (const text of ['Muốn ăn món Nhật.', 'tìm quán Nhật', 'ăn đồ Nhật nhé']) expect(need(text).priorities.map(p => p.key), text).toContain('cuisine:japanese')
  })
  it('a restated, non-superlative priority later is no longer extreme', () => {
    expect(need('Rẻ nhất.', 'Giá quan trọng.').priorities.some(p => p.extreme)).toBe(false)
  })
  // A03 / A02 shaped sets (locked Benchmark V1 numbers as acceptance examples)
  const A03 = () => [P('A', { priceHighVnd: 180_000, distanceKm: 0.5, rating: 4.1, reviewCount: 100 }), P('B', { priceHighVnd: 300_000, distanceKm: 2, rating: 4.8, reviewCount: 100 }), P('C', { priceHighVnd: 220_000, distanceKm: 1, rating: 4.5, reviewCount: 100 })]
  const A02 = () => [P('A', { priceHighVnd: 300_000, distanceKm: 0.8, rating: 4.3, reviewCount: 100 }), P('B', { priceHighVnd: 700_000, distanceKm: 3, rating: 4.9, reviewCount: 100 }), P('C', { priceHighVnd: 450_000, distanceKm: 1.5, rating: 4.6, reviewCount: 100 })]
  it('cheapest ("Rẻ nhất") → the lowest price band, whatever the rating (A03-1)', () => {
    const n = need('Rẻ nhất.')
    const r = rankCandidates(A03(), n)
    expect(names(r)[0]).toBe('A')
    expect(derivePick(r, n)?.candidate.name).toBe('A')
  })
  it('nearest ("Gần nhất" / "Chỉ cần gần nhà") → the smallest distance (A03-2, A02-1)', () => {
    for (const [set, text] of [[A03(), 'Gần nhất.'], [A02(), 'Chỉ cần gần nhà.']] as const) {
      const n = need(text)
      expect(derivePick(rankCandidates(set, n), n)?.candidate.name, text).toBe('A')
    }
  })
  it('highest rated → the highest rating even when a lower-rated place has far more reviews', () => {
    const set = () => [P('Nổi', { rating: 4.8, reviewCount: 5000 }), P('Cao', { rating: 4.9, reviewCount: 100 })]
    const n = need('quán đánh giá cao nhất')
    expect(names(rankCandidates(set(), n))[0]).toBe('Cao')
    // control: with no superlative the review-count term still counts (default behaviour unchanged)
    expect(names(rankCandidates(set(), need('quán ngon')))[0]).toBe('Nổi')
  })
  it('extremum holds beyond the old 10 km floor (D08-shaped: 8 km vs 1 km) and with no budget ceiling', () => {
    const set = () => [P('Xa', { priceHighVnd: 100_000, distanceKm: 8 }), P('Gần', { priceHighVnd: 180_000, distanceKm: 1 })]
    expect(names(rankCandidates(set(), need('Muốn rẻ nhất.')))[0]).toBe('Xa')
    expect(names(rankCandidates(set(), need('Muốn chỗ gần nhất.')))[0]).toBe('Gần')
    const far = () => [P('X', { distanceKm: 14 }), P('Y', { distanceKm: 12 }), P('Z', { distanceKm: 20 })]
    expect(names(rankCandidates(far(), need('gần nhất')))).toEqual(['Y', 'X', 'Z'])
  })
  it('input order never decides: every permutation yields the same order and the same Pick', () => {
    const n = need('Rẻ nhất.')
    const ref = names(rankCandidates(A03(), n))
    for (const p of perms(A03())) {
      expect(names(rankCandidates(p, n))).toEqual(ref)
      expect(derivePick(rankCandidates(p, n), n)?.candidate.name).toBe('A')
    }
  })
  it('exact ties fall to the existing chain (reviews → name → id), not to input order', () => {
    const set = () => [P('Quán', { priceHighVnd: 100_000, reviewCount: 10 }, 'places', 'id-2'), P('Quán', { priceHighVnd: 100_000, reviewCount: 10 }, 'places', 'id-1')]
    const n = need('rẻ nhất')
    const ids = (r: RankedResult) => r.ranked.map(e => e.candidate.id)
    expect(ids(rankCandidates(set(), n))).toEqual(['id-1', 'id-2'])
    expect(ids(rankCandidates([...set()].reverse(), n))).toEqual(['id-1', 'id-2'])
  })
  it('missing evidence is never a penalty or an invention: one known price, others unknown → no extremum is claimed', () => {
    const r = rankCandidates([P('A', { priceHighVnd: 100_000 }), P('B', { rating: 4.5 }), P('C', { rating: 4.2 })], need('Rẻ nhất.'))
    expect(r.ranked.every(e => e.score === 0)).toBe(true)
    expect(r.ranked.find(e => e.candidate.name === 'B')?.missing).toContain('price')
  })
  it('a hard budget still eliminates first; the extremum is taken over the survivors', () => {
    const set = () => [P('Rẻ nhưng quá', { priceHighVnd: 90_000 }), P('Vừa', { priceHighVnd: 150_000 }), P('Đắt hơn', { priceHighVnd: 190_000 })]
    // budget below the cheapest is irrelevant here: the cheapest within "dưới 200k" is still the cheapest
    const r = rankCandidates(set(), need('Rẻ nhất, ngân sách dưới 200k.'))
    expect(names(r)[0]).toBe('Rẻ nhưng quá')
    const r2 = rankCandidates([...set(), P('Ngoài', { priceHighVnd: 50_000 })].map(c => ({ ...c, attrs: { ...c.attrs, priceHighVnd: c.name === 'Ngoài' ? 250_000 : c.attrs.priceHighVnd } })), need('Rẻ nhất, ngân sách dưới 200k.'))
    expect(r2.filtered.map(f => f.candidate.name)).toEqual(['Ngoài'])
  })
  it('two stated priorities are NOT the extreme mode (existing explicit behaviour)', () => {
    const n = need('Rẻ nhất và gần nhất.')
    expect(n.priorities.filter(p => p.extreme).length).toBe(2)
    const r = rankCandidates(A03(), n)
    expect(r.ranked.length).toBe(3) // ranked by the existing explicit mode (both axes, own weights); no crash, deterministic
    expect(names(rankCandidates([...A03()].reverse(), n))).toEqual(names(r))
  })
})

// ── C. household-only Pick ──────────────────────────────────────────────────────────────────────────────────────────────────────
describe('C. household context is a decidable need when the ranking used supplied family evidence (D8)', () => {
  const A05 = () => [P('A', { priceHighVnd: 120_000, distanceKm: 1, rating: 4.2, reviewCount: 100, familyFriendly: true }), P('B', { priceHighVnd: 160_000, distanceKm: 2, rating: 4.8, reviewCount: 100, familyFriendly: false }), P('C', { priceHighVnd: 140_000, distanceKm: 3, rating: 4.5, reviewCount: 100, familyFriendly: true })]
  it('"Đi với trẻ nhỏ." with family evidence → a Pick (rank 1), as the ranker already ordered it', () => {
    const n = need('Đi với trẻ nhỏ.')
    expect(n.household?.kids).toBe(true)
    const r = rankCandidates(A05(), n)
    expect(names(r)[0]).toBe('C')
    expect(derivePick(r, n)?.candidate.name).toBe('C')
    expect(derivePickOrState(r, n).pick?.candidate.name).toBe('C')
  })
  it('household with NO supplied family evidence stays undecided: nothing is invented, no threshold is lowered', () => {
    const n = need('Đi với trẻ nhỏ.')
    const r = rankCandidates([P('A', { rating: 4.2, reviewCount: 100 }), P('B', { rating: 4.8, reviewCount: 100 })], n)
    expect(derivePick(r, n)).toBeNull()
    expect(derivePickOrState(r, n)).toEqual({ pick: null, state: 'no_evidence' })
  })
  it('"đi với bé" is context, never a hard constraint: a family-unknown candidate is not eliminated', () => {
    const n = need('Đi với bé 3 tuổi, muốn chỗ thoải mái.')
    const r = rankCandidates([P('A', { rating: 4.8, reviewCount: 100 }), P('B', { rating: 4.5, reviewCount: 100, familyFriendly: true })], n)
    expect(r.filtered).toEqual([])
    expect(names(r).length).toBe(2)
  })
  it('a stated balance, avoid and registry must-have are decision inputs too (they were ignored by the Pick gate)', () => {
    const base = () => [P('A', { rating: 4.2, reviewCount: 100, vegetarian: true }), P('B', { rating: 4.8, reviewCount: 100, vegetarian: true })]
    const veg = need('Mình ăn chay.')
    expect(derivePick(rankCandidates(base(), veg), veg)).not.toBeNull()
    const helmet = need('Muốn rẻ nhưng bắt buộc có mũ.')
    const hr = rankCandidates([P('A', { priceHighVnd: 100_000, helmetIncluded: true }), P('B', { priceHighVnd: 70_000, helmetIncluded: false }), P('C', { priceHighVnd: 90_000, helmetIncluded: true })], helmet)
    expect(hr.filtered.map(f => f.candidate.name)).toEqual(['B'])
    expect(derivePick(hr, helmet)).not.toBeNull()
  })
})

// ── D. attribute information flow ───────────────────────────────────────────────────────────────────────────────────────────────
describe('D. product attributes the ranker already reads reach the model that writes the reason', () => {
  const row = (extra: Record<string, unknown>) => ({ name: 'Cafe X', google_rating: '⭐ 4.5 (100 đánh giá)', rating_value: 4.5, rating_count: 100, ...extra })
  it('wifi / outdoor_seating / vegetarian booleans survive the compact row (false included), only when the provider supplied them', () => {
    const out = trimPlacesForModel({ results: [row({ wifi: true, outdoor_seating: false, vegetarian: true }), row({ name: 'Cafe Y' })] }, 'results', { modelChooses: true }) as { results: Array<Record<string, unknown>> }
    expect(out.results[0]).toMatchObject({ wifi: true, outdoor_seating: false, vegetarian: true })
    expect('wifi' in out.results[1]).toBe(false) // absent stays absent: UNKNOWN is never a value
    const v2 = trimPlacesForModel({ results: [row({ wifi: true })] }, 'results', { consultTop: 3 }) as { results: Array<Record<string, unknown>> }
    expect(v2.results[0].wifi).toBe(true)
  })
  it('benchmark-only attribute names (family_friendly, same_day, crowd_level …) have no production producer and are NOT promoted to the model', () => {
    const out = trimPlacesForModel({ results: [row({ family_friendly: true, same_day: true, crowd_level: 'Low' })] }, 'results', { modelChooses: true }) as { results: Array<Record<string, unknown>> }
    for (const k of ['family_friendly', 'same_day', 'crowd_level']) expect(k in out.results[0]).toBe(false)
  })
})

// ── E. Pick / shortlist consistency ─────────────────────────────────────────────────────────────────────────────────────────────
describe('E. the engine Pick is drawn from the set the shortlist admits', () => {
  // The decision needs a price band; the best-rated place has none, so qualifiesFor rejects it for the shortlist while rank 1 is still that place.
  const set = () => [P('Cao điểm không giá', { rating: 4.9, reviewCount: 500 }), P('Có giá A', { priceHighVnd: 150_000, rating: 4.4, reviewCount: 100 }), P('Có giá B', { priceHighVnd: 200_000, rating: 4.2, reviewCount: 100 })]
  const frame = { informationNeeded: ['price'] } as unknown as Parameters<typeof qualifiesFor>[0]
  const n = need('Muốn tìm quán ngon giá hợp lý.')
  it('the reachable divergence: the unrestricted Pick names a candidate the shortlist would not admit', () => {
    const r = rankCandidates(set(), n)
    const pick = derivePick(r, n)
    expect(pick).not.toBeNull()
    const admitted = r.ranked.filter(e => qualifiesFor(frame, e)).map(e => e.candidate.name)
    expect(admitted).not.toContain(pick!.candidate.name)
  })
  it('restricted to the admitted entries the Pick is always a shortlist member, and the order is untouched', () => {
    const r = rankCandidates(set(), n)
    const rr = restrictRankedTo(r, e => qualifiesFor(frame, e))
    expect(names(rr)).toEqual(names(r).filter(x => x !== 'Cao điểm không giá'))
    const pick = derivePickOrState(rr, n).pick
    expect(pick?.candidate.name).toBe('Có giá A')
    expect(rr.ranked.map(e => e.candidate.name)).toContain(pick!.candidate.name)
  })
  it('nothing admitted, or everything admitted → the ranking is returned unchanged (no new state, no forced difference)', () => {
    const r = rankCandidates(set(), n)
    expect(restrictRankedTo(r, () => false)).toBe(r)
    expect(restrictRankedTo(r, () => true)).toBe(r)
  })
  it('hard filtering information is preserved (`filtered`, `budgetFilterEmpty`)', () => {
    const r = rankCandidates([...set(), P('Quá tiền', { priceHighVnd: 900_000, rating: 5 })], need('Ngân sách dưới 300k, muốn quán ngon.'))
    const rr = restrictRankedTo(r, e => qualifiesFor(frame, e))
    expect(rr.filtered).toEqual(r.filtered)
    expect(rr.budgetFilterEmpty).toBe(r.budgetFilterEmpty)
  })
})

// ── F. stable tie fallback outside places ────────────────────────────────────────────────────────────────────────────────────────
describe('F. a legacy-domain tie never falls to input order', () => {
  it('two same-named hotels with equal score and reviews are ordered by id under every input order', () => {
    const set = () => [P('Ibis', { stars: 3, reviewCount: 100 }, 'hotel', 'h-2'), P('Ibis', { stars: 3, reviewCount: 100 }, 'hotel', 'h-1')]
    const n = need('khách sạn quận 1')
    for (const p of perms(set())) expect(rankCandidates(p, n).ranked.map(e => e.candidate.id)).toEqual(['h-1', 'h-2'])
  })
})

// ── G. D9 domain question and multi-turn sufficiency ────────────────────────────────────────────────────────────────────────────
describe('G. the D9 domain question is not overridden by an intent read that found no domain', () => {
  const dm = (o: Partial<ConsultDecision>): ConsultDecision => ({ domains: [], turn: 'chat', known: {}, assumptions: [], ...o })
  const ruleAsk = routeConsult(conv('Ngân sách dưới 300k.'), { hasGps: true, lang: 'vi' })
  it('premise: the rules ask one domain question, deterministically', () => {
    expect(ruleAsk.confidence).toBe('rule')
    expect(ruleAsk.decision.turn).toBe('ask')
    expect(ruleAsk.decision.ask?.questions[0].id).toBe('domain')
  })
  it('Luna reads "chat" with no domain → the router\'s question stands (nothing is invented, no tool follows)', () => {
    const m = mergeIntentWithRules(dm({ turn: 'chat', known: { ngan_sach: 'dưới 300k' } }), ruleAsk)
    expect(m.decision.turn).toBe('ask')
    expect(m.decision.domains).toEqual([])
    expect(m.decision.ask?.questions[0].id).toBe('domain')
    expect(m.decision.query).toBeUndefined()
    expect(m.mode).toBe('merged')
  })
  it('"Không quá 500k." (a hard-ceiling phrase) is state-only too: one domain question, rules-sure (it used to be left to the answer model, which chose a shopping search)', () => {
    const r = routeConsult(conv('Không quá 500k.'), { hasGps: true, lang: 'vi' })
    expect(r.confidence).toBe('rule')
    expect(r.decision.turn).toBe('ask')
    expect(r.decision.ask?.questions[0].id).toBe('domain')
    expect(mergeIntentWithRules(dm({ turn: 'chat', known: { ngan_sach: 'không quá 500k' } }), r).decision.turn).toBe('ask')
  })
  it('Luna names a domain for a state-only message → still the D9 question of the rules: no word of the message grounds that domain', () => {
    const m = mergeIntentWithRules(dm({ turn: 'pick', domains: ['food'], known: { mon: 'phở' } }), ruleAsk)
    expect(m.decision.turn).toBe('ask')
    expect(m.decision.domains).toEqual([])
    expect(m.decision.ask?.questions[0].id).toBe('domain')
  })
  it('a domain the USER named is outside this branch: the pick / ask of the rules on a named domain is unchanged', () => {
    const named = routeConsult(conv('Tìm quán ăn tối món Việt cho 2 người dưới 300k ở Quận 1'), { hasGps: true, lang: 'vi' })
    expect(named.decision.turn).toBe('pick')
    expect(mergeIntentWithRules(dm({ turn: 'pick', domains: ['food'] }), named).decision.turn).toBe('pick')
    // and an in-thread follow-up is never a D9 question
    const follow = routeConsult([{ role: 'user', content: 'Tìm quán phở quận 1 cho 2 người dưới 100k' }, { role: 'assistant', content: 'Mình chọn **Phở Hòa**.' }, { role: 'user', content: 'Rẻ nhất.' }], { hasGps: true, lang: 'vi' })
    expect(follow.decision.ask?.questions[0]?.id).not.toBe('domain')
  })
})

describe('G. sufficiency counts what the user already said before the domain was named (benchmark H04)', () => {
  const turns = (...rows: Array<[string, string]>) => rows.map(([role, content]) => ({ role, content }))
  const ctx = { hasGps: true, lang: 'vi' }
  it('"Đi 4 người." / "Có 2 trẻ em." then "Ngân sách khoảng 1 triệu, muốn món Việt." → a pick, not another question', () => {
    const r = routeConsult(turns(['user', 'Đi 4 người.'], ['assistant', 'Bạn muốn tìm gì?'], ['user', 'Có 2 trẻ em.'], ['assistant', 'Bạn muốn tìm gì?'], ['user', 'Ngân sách khoảng 1 triệu, muốn món Việt.']), ctx)
    expect(r.decision.turn).toBe('pick')
    expect(r.decision.known).toMatchObject({ so_nguoi: '4 người', ngan_sach: 'khoảng 1 triệu' })
  })
  it('the same last message alone is still insufficient (the rule itself is unchanged)', () => {
    // With GPS (a place to look) one criterion now searches (AI-Hay pass 04/10); with no GPS and no area the missing place is still asked.
    const r = routeConsult(turns(['user', 'Ngân sách khoảng 1 triệu, muốn món Việt.']), { hasGps: false, lang: 'vi' })
    expect(r.decision.turn).toBe('ask')
  })
  it('earlier turns never leak across a consultation thread: a new domain after a thread reads only its own message', () => {
    const r = routeConsult(turns(['user', 'Muốn ăn phở quận 1 cho 2 người dưới 100k'], ['assistant', 'Mình chọn **Phở Hòa**.'], ['user', 'Tìm spa tốt.']), ctx)
    expect(r.decision.domains).toEqual(['spa'])
    expect(JSON.stringify(r.decision.known)).not.toContain('2 người')
  })
})
