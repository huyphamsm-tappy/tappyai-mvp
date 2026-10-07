// Phase 3C — the Consultative Brief (3C.1 / 3C.2) and the engine-Pick handoff (3C.3). Built only from engine objects; nothing here scores.
import { describe, it, expect } from 'vitest'
import { deriveNeedProfile, type NeedProfile } from './needProfile'
import { rankCandidates } from './rank'
import { derivePickOrState } from './pick'
import { normalizePlaces, normalizeHotels, type Candidate, type CandidateAttrs } from './candidate'
import { buildBrief, briefForModel, consultBriefEnabled, BRIEF_NOTE, type ConsultativeBrief } from './consultativeBrief'
import { trimPlacesForModel } from './modelPayload'
import { enforceEnginePickSentence } from './consultBrain'
import { alignEmphasisToEnginePick } from '@/lib/recommendation/liveView'

const need = (...texts: string[]): NeedProfile => deriveNeedProfile(texts.map(content => ({ role: 'user', content })))
const P = (name: string, attrs: CandidateAttrs): Candidate => ({ id: `id-${name}`, name, domain: 'places', attrs, link: `https://maps/${name}`, raw: { secret_raw_field: 'must-not-travel' } })
function brief(n: NeedProfile, cands: Candidate[], stage = 'pick'): ConsultativeBrief {
  const ranked = rankCandidates(cands, n)
  const d = derivePickOrState(ranked, n, { explicitChoiceRequest: true })
  return buildBrief({ need: n, ranked, pick: d.pick, state: d.state, stage, goal: 'decide' })
}
const SET = () => [
  P('Phở Hòa', { rating: 4.2, reviewCount: 100, priceHighVnd: 80_000, distanceKm: 2 }),
  P('Bún Bò Cô Ba', { rating: 4.8, reviewCount: 300, priceHighVnd: 150_000, distanceKm: 1 }),
  P('Cơm Tấm Ba', { rating: 4.5, reviewCount: 200, priceHighVnd: 110_000, distanceKm: 4 }),
]

describe('3C.1 — the Brief carries the engine decision', () => {
  it('1. the Pick is the engine Pick: same candidate, same basis', () => {
    const n = need('ưu tiên chất lượng')
    const ranked = rankCandidates(SET(), n)
    const d = derivePickOrState(ranked, n)
    const b = buildBrief({ need: n, ranked, pick: d.pick, state: d.state, stage: 'pick' })
    expect(d.pick).not.toBeNull()
    expect(b.pick?.name).toBe(d.pick!.candidate.name)
    expect(b.pick?.name).toBe('Bún Bò Cô Ba')
    expect(b.pick?.reason).toBe(d.pick!.reason)
    expect(b.state).toBeNull()
    expect(b.provenance).toBe('engine')
    expect(b.candidates[0].name).toBe(b.pick?.name) // rank 1 is the Pick
    expect(b.candidates[0].rank).toBe(1)
  })
  it('2. user priorities are preserved: stated, dismissed, balance — and kept apart', () => {
    const b1 = brief(need('Ăn trưa, giá không quan trọng, ưu tiên chất lượng.'), SET())
    expect(b1.priorities.map(p => p.key)).toEqual(['rating'])
    expect(b1.dismissed).toEqual(['price'])
    const b2 = brief(need('Ăn trưa, muốn cân bằng giá và chất lượng.'), SET())
    expect(b2.tradeoff).toEqual({ kind: 'balanced', keys: ['price', 'rating'] })
  })
  it('3. hard / soft constraints, must-have, avoid, budget and household are preserved', () => {
    const rows = [P('A', { rating: 4, familyFriendly: true, spicy: false }), P('B', { rating: 4.5, familyFriendly: true }), P('C', { rating: 4.9, familyFriendly: false })]
    const b = brief(need('Bắt buộc phù hợp cho bé, không ăn cay, khoảng 300k'), rows)
    expect(b.constraints.mustHave).toContain('family_friendly')
    expect(b.constraints.avoid).toContain('spicy')
    expect(b.constraints.budget).toMatchObject({ type: 'around', stated: 300000 })
    expect(b.constraints.household).toMatchObject({ kids: true })
    expect(b.eliminated).toEqual([{ name: 'C', by: 'mustHave' }])
    // household context alone is soft: it appears as household, never as a must-have
    const soft = brief(need('Đi với bé 3 tuổi'), rows)
    expect(soft.constraints.household).toEqual({ kids: true, childAges: [3] })
    expect(soft.constraints.mustHave).not.toContain('family_friendly')
    expect(soft.eliminated).toEqual([])
  })
  it('4. unknowns are preserved per candidate and never become facts', () => {
    const b = brief(need('Đi với bé 3 tuổi'), [P('Có', { rating: 4.5, familyFriendly: true }), P('Không rõ', { rating: 4.5 })])
    const unknown = b.candidates.find(c => c.name === 'Không rõ')!
    expect(unknown.unknowns).toContain('family_friendly')
    expect(unknown.evidence.some(e => e.id === 'familyFriendly')).toBe(false)
    expect(b.unknowns).toContainEqual({ candidate: 'Không rõ', attribute: 'family_friendly' })
  })
  it('5. trade-offs and why-not come from the ranking itself', () => {
    const n = need('ưu tiên chất lượng')
    const b = brief(n, SET())
    expect(b.pick!.whyFits.length).toBeGreaterThan(0)
    expect(b.pick!.whyFits[0].attribute).toBe('rating')
    for (const w of b.pick!.whyNot) expect(w.pickLeadsOn).toEqual(expect.arrayContaining(['rating']))
    // a trade-off exists only when the runner-up genuinely leads on something the engine computed
    for (const t of b.tradeoffs) expect(typeof t.evidence).toBe('string')
  })
  it('6. candidate provenance: every factual entry is a FACT read from the normalised provider row, nothing from a name', () => {
    const c = normalizePlaces({ results: [
      { name: 'Nhà hàng Gia Đình Yên Tĩnh', maps_link: 'https://m/1', google_rating: '4.5⭐ (1.200 đánh giá Google Maps)', family_friendly: true },
      { name: 'Quán Xa', maps_link: 'https://m/2', google_rating: '4.0⭐ (100 đánh giá Google Maps)' },
    ] })
    const b = brief(need('Đi với bé'), c)
    const named = b.candidates.find(x => x.name.includes('Gia Đình'))!
    expect(named.evidence.every(e => e.kind === 'FACT' && e.source === 'provider_row')).toBe(true)
    expect(named.evidence.find(e => e.id === 'familyFriendly')).toMatchObject({ value: true })
    const other = b.candidates.find(x => x.name === 'Quán Xa')!
    expect(other.evidence.find(e => e.id === 'familyFriendly')).toBeUndefined() // not derived from the other row, not from any name
    expect(other.unknowns).toContain('family_friendly')
  })
  it('17. multi-turn refinement survives into the Brief: the latest budget, the turn it changed, the contradicted priority', () => {
    const n = need('Giá quan trọng.', 'Thực ra giá không quan trọng, dưới 400k')
    const b = brief(n, SET(), 'reject')
    expect(b.stage).toBe('reject')
    expect(b.refinement.turns).toBe(2)
    expect(b.refinement.changedAtTurn.budget).toBe(2)
    expect(b.refinement.conflicts).toEqual(['price'])
    expect(b.constraints.budget).toMatchObject({ type: 'under', max: 400000 })
  })
})

describe('3C.3 — explicit no-Pick states are carried, never forced', () => {
  it('10/11. all candidates eliminated → no pick, state all_eliminated, the eliminated named as eliminated', () => {
    const b = brief(need('Bắt buộc phù hợp cho bé'), [P('A', { rating: 4, familyFriendly: false }), P('B', { rating: 5, familyFriendly: false })])
    expect(b.pick).toBeNull()
    expect(b.state).toBe('all_eliminated')
    expect(b.candidates).toEqual([])
    expect(b.eliminated.map(e => e.name).sort()).toEqual(['A', 'B'])
  })
  it('10/12. nothing to decide on → no pick, state no_evidence', () => {
    const b = brief(need('ưu tiên gần'), [P('A', {}), P('B', {})])
    expect(b.pick).toBeNull()
    expect(b.state).toBe('no_evidence')
  })
  it('a single candidate: an answer, not a choice — no pick and no state', () => {
    const b = brief(need('ưu tiên gần'), [P('Một', { distanceKm: 1 })])
    expect(b.pick).toBeNull()
    expect(b.state).toBeNull()
  })
})

describe('3C.2 / 3C.4 — what travels to Luna', () => {
  it('7. the Brief is controlled data: no raw provider rows, links or addresses; the note says the engine decided', () => {
    const b = briefForModel(brief(need('ưu tiên chất lượng'), SET()))
    const s = JSON.stringify(b)
    expect(s).not.toContain('secret_raw_field')
    expect(s).not.toContain('https://maps/')
    expect(b.note).toBe(BRIEF_NOTE)
    expect(BRIEF_NOTE).toMatch(/khong doi lua chon/i)
  })
  it('7. the Brief rides the existing tool-result channel next to `_tappy_ranking` through the consult trim (no new transport)', () => {
    const b = briefForModel(brief(need('ưu tiên chất lượng'), SET()))
    const result = { results: SET().map(c => ({ name: c.name, google_rating: '4.5⭐ (10 đánh giá Google Maps)' })), _tappy_ranking: { pick: 'x' }, _tappy_brief: b }
    const out = trimPlacesForModel(result, 'results', { consultTop: 3 }) as Record<string, unknown>
    expect(out._tappy_brief).toEqual(b)
    expect(out._tappy_ranking).toEqual({ pick: 'x' })
  })
  it('the flag defaults OFF', () => {
    expect(consultBriefEnabled({})).toBe(false)
    expect(consultBriefEnabled({ CONSULT_BRIEF: '1' })).toBe(true)
  })
  it('the Brief is bounded: at most three candidates travel', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((n, i) => P(n, { rating: 4 + i / 10, reviewCount: 10 }))
    expect(brief(need('ưu tiên chất lượng'), many).candidates).toHaveLength(3)
  })
})

describe('3C.3 — Luna cannot silently replace the engine Pick', () => {
  it('8. a pick sentence naming another venue is rewritten to the engine Pick, and the divergence is reported', () => {
    const r = enforceEnginePickSentence('**Mình chọn: Phở Hòa** vì gần.\n\nLý do…', 'Bún Bò Cô Ba')
    expect(r.text).toContain('**Mình chọn: Bún Bò Cô Ba**')
    expect(r.text).not.toContain('Phở Hòa')
    expect(r.diverged).toBe('Phở Hòa')
  })
  it('8. the same venue (head-only or full provider name) is not a divergence; text is untouched', () => {
    const t = '**Mình chọn: Béo Ơi Quán** — hợp.'
    expect(enforceEnginePickSentence(t, 'Béo Ơi Quán - Món ngon Hà Nội')).toEqual({ text: t, diverged: null })
    expect(enforceEnginePickSentence(t, 'Béo Ơi Quán')).toEqual({ text: t, diverged: null })
  })
  it('8. no engine Pick (an explicit state) or no pick sentence: nothing is rewritten and nothing is invented', () => {
    expect(enforceEnginePickSentence('**Mình chọn: X**', null)).toEqual({ text: '**Mình chọn: X**', diverged: null })
    expect(enforceEnginePickSentence('Không có câu chọn.', 'Y')).toEqual({ text: 'Không có câu chọn.', diverged: null })
  })
  it('9. card emphasis stays with the engine Pick whatever the reply named first (alignment)', () => {
    const rec = (id: string, recommended: boolean) => ({ entity: { id }, recommended, reasons: recommended ? [{ attribute: 'rating', evidence: 'rated 4.8' }] : [], tradeOff: null }) as never
    const recs = [rec('a', true), rec('b', false)]
    const r = alignEmphasisToEnginePick(recs, 'b')
    expect(r.outcome).toBe('engine_kept')
    expect((r.recs[0] as { recommended: boolean }).recommended).toBe(true)
    expect(alignEmphasisToEnginePick(recs, 'a').outcome).toBe('same')
    expect(alignEmphasisToEnginePick([rec('a', false)], 'a').outcome).toBe('no_engine_pick')
  })
})

describe('A5 — hotels: the Brief is grounded in hotel facts, engine-authoritative, and carries no places-only evidence or raw rows', () => {
  const hotels = () => normalizeHotels({
    search_results: [{ title: 'TTR Skypool Boutique Hotel', link: 'https://www.booking.com/hotel/vn/ttr-skypool.html', snippet: 'Từ 393.582 VND/đêm' }],
    hotel_list: [
      { name: 'AOA Da Nang Beach Hotel', address: '12 Võ Nguyên Giáp', maps_link: 'https://www.google.com/maps?q=16.05,108.24', stars: '4', distance_km: 0.3 },
      { name: 'Nhà nghỉ Bình Dân', address: '80 Hoàng Diệu', maps_link: 'https://www.google.com/maps?q=16.06,108.21', stars: '2', distance_km: 4.5 },
    ],
  })
  const hotelNeed = (...texts: string[]) => { const n = need(...texts); return { ...n, domain: 'hotel' as const } }
  it('the Pick is the engine Pick and every evidence entry is a FACT from the normalised hotel row', () => {
    const n = hotelNeed('khách sạn Đà Nẵng ưu tiên gần biển')
    const ranked = rankCandidates(hotels(), n)
    const d = derivePickOrState(ranked, n, { explicitChoiceRequest: true })
    const b = buildBrief({ need: n, ranked, pick: d.pick, state: d.state, stage: 'pick' })
    expect(d.pick).not.toBeNull()
    expect(b.pick?.name).toBe(d.pick!.candidate.name)
    for (const c of b.candidates) for (const e of c.evidence) { expect(e.kind).toBe('FACT'); expect(e.source).toBe('provider_row') }
    const aoa = b.candidates.find(c => c.name === 'AOA Da Nang Beach Hotel')
    expect(aoa?.evidence.find(e => e.id === 'stars')).toMatchObject({ value: 4 })
  })
  it('places-only attributes never appear in a hotel Brief, and a family requirement stays UNKNOWN for hotels', () => {
    const n = hotelNeed('khách sạn Đà Nẵng, bắt buộc phù hợp cho bé')
    const ranked = rankCandidates(hotels(), n)
    const d = derivePickOrState(ranked, n, { explicitChoiceRequest: true })
    const b = buildBrief({ need: n, ranked, pick: d.pick, state: d.state, stage: 'pick' })
    const ids = new Set(b.candidates.flatMap(c => c.evidence.map(e => e.id)))
    for (const placesOnly of ['familyFriendly', 'spicy', 'helmetIncluded']) expect(ids.has(placesOnly)).toBe(false)
    expect(ranked.filtered).toEqual([]) // no evidence ⇒ nobody is eliminated
    for (const c of b.candidates) expect(c.unverified).toContain('family_friendly')
  })
  it('no raw provider row or link enters a hotel Brief', () => {
    const n = hotelNeed('khách sạn Đà Nẵng ưu tiên gần biển')
    const ranked = rankCandidates(hotels(), n)
    const s = JSON.stringify(briefForModel(buildBrief({ need: n, ranked, pick: derivePickOrState(ranked, n, { explicitChoiceRequest: true }).pick, state: null, stage: 'pick' })))
    for (const raw of ['booking.com', 'google.com/maps', 'Võ Nguyên Giáp', '393.582']) expect(s, raw).not.toContain(raw)
  })
})
