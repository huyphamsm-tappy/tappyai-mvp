import { describe, it, expect } from 'vitest'
import { analyzeConsultativeReply } from './replyAnalysis'
import { rankCandidates, type Candidate } from './rank'
import { derivePick } from './pick'
import type { NeedProfile } from './needProfile'

// ── PC-01…03, TO-01, WHY-01 — Phase 2 acceptance instrumentation ────────────
//
// These are INSTRUMENTS, not prompt rules. They read a finished reply against the
// evidence that produced it and say whether the consultative properties actually
// hold. Two things follow:
//
//   1. They are testable now, offline, with fixture replies — which is why a GOOD
//      reply and a BAD reply are asserted side by side in every block. An
//      instrument that only ever passes measures nothing.
//   2. They are the same instrument Phase 5 runs against live replies once
//      SERPER_API_KEY exists, so the offline and live numbers are comparable.

function place(name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id: name, name, domain: 'places', attrs, link: `https://maps/${encodeURIComponent(name)}`, raw: { name } }
}

function profile(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'places', subject: null, budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}

const CANDIDATES = [
  place('Quán Gần', { rating: 4.6, reviewCount: 1200, distanceKm: 0.3, wifi: true }),
  place('Quán Xa', { rating: 4.9, reviewCount: 8000, distanceKm: 7.5 }),
]
const NEED = profile({ priorities: [{ key: 'distance', weight: 2, source: 'stated' }], useCases: ['work'] })
const RANKED = rankCandidates(CANDIDATES, NEED)
const PICK = derivePick(RANKED, NEED)

const analyze = (text: string) => analyzeConsultativeReply(text, { ranked: RANKED, need: NEED, pick: PICK })

// A reply that does everything the contract asks for.
const GOOD = `Mình tìm được hai chỗ hợp với bạn nè!

**Quán Gần** cách bạn 0.3km, đánh giá 4.6 và có wifi nên ngồi làm việc rất ổn.
**Quán Xa** thì đánh giá 4.9 với 8000 lượt, cao hơn hẳn, nhưng cách tới 7.5km.

Vì bạn cần chỗ gần để làm việc nên mình nghiêng về **Quán Gần** — đổi lại bạn phải chấp nhận điểm đánh giá thấp hơn một chút so với Quán Xa.

Bạn định ngồi bao lâu?`

// A reply that "sounds consultative" and satisfies none of it.
const GENERIC = `Mình tìm được vài quán ngon lắm nha!

**Quán Gần** rất tuyệt vời, ai cũng thích.
**Quán Xa** cũng rất ổn.

Quán nào cũng có ưu và nhược điểm riêng, bạn cân nhắc nhé. Chúc bạn ngon miệng!`

describe('PC-01 — both candidates get comparable coverage (symmetry)', () => {
  it('a balanced reply is recognised as balanced', () => {
    expect(analyze(GOOD).prosCons.balanced).toBe(true)
  })

  it('a lopsided reply FAILS — three sentences one side, one the other', () => {
    const lopsided = `**Quán Gần** cách 0.3km. Quán Gần có wifi. Quán Gần đánh giá 4.6 rất tốt. Quán Gần rất hợp làm việc.
**Quán Xa** cũng được.`
    expect(analyze(lopsided).prosCons.balanced).toBe(false)
  })

  it('counts coverage per candidate, by name', () => {
    const a = analyze(GOOD)
    expect(a.prosCons.perCandidate['Quán Gần']).toBeGreaterThan(0)
    expect(a.prosCons.perCandidate['Quán Xa']).toBeGreaterThan(0)
  })
})

describe('PC-02 — every factual claim traces to candidate evidence', () => {
  it('a grounded reply reports no ungrounded claims', () => {
    expect(analyze(GOOD).ungroundedClaims).toEqual([])
  })

  it('an INVENTED attribute is caught — Quán Xa has no wifi evidence', () => {
    const invented = `**Quán Gần** cách 0.3km. **Quán Xa** có wifi rất mạnh và chỗ ngồi ngoài trời.`
    const a = analyze(invented)
    expect(a.ungroundedClaims).toContain('Quán Xa:wifi')
    expect(a.ungroundedClaims).toContain('Quán Xa:outdoor')
  })

  it('a claim about an attribute the candidate DOES have is not flagged', () => {
    const ok = `**Quán Gần** có wifi.`
    expect(analyze(ok).ungroundedClaims).toEqual([])
  })
})

describe('PC-03 — pros/cons must be candidate-specific, not blanket praise', () => {
  it('the generic reply is not counted as pros/cons', () => {
    expect(analyze(GENERIC).prosCons.candidateSpecific).toBe(false)
  })

  it('the good reply is', () => {
    expect(analyze(GOOD).prosCons.candidateSpecific).toBe(true)
  })
})

describe('TO-01 — the trade-off must be candidate-specific, user-specific AND grounded', () => {
  const good = analyze(GOOD)

  it('detects a real trade-off', () => {
    expect(good.tradeoff.present).toBe(true)
  })

  it('it names actual candidates', () => {
    expect(good.tradeoff.candidateSpecific).toBe(true)
  })

  it('it connects to what the USER said', () => {
    expect(good.tradeoff.userSpecific).toBe(true)
  })

  it('it is grounded in an attribute the evidence supports', () => {
    expect(good.tradeoff.grounded).toBe(true)
  })

  it('"every option has pros and cons" FAILS every clause — this is the point', () => {
    const t = analyze(GENERIC).tradeoff
    expect(t.candidateSpecific).toBe(false)
    expect(t.userSpecific).toBe(false)
    expect(t.grounded).toBe(false)
  })

  it('a contrast with no user requirement behind it is not user-specific', () => {
    const noUser = `**Quán Gần** cách 0.3km nhưng **Quán Xa** đánh giá 4.9 cao hơn.`
    const t = analyze(noUser).tradeoff
    expect(t.present).toBe(true)
    expect(t.candidateSpecific).toBe(true)
    expect(t.userSpecific).toBe(false)
  })
})

describe('WHY-01 — the explanation joins a requirement to evidence', () => {
  it('the good reply explains why', () => {
    const w = analyze(GOOD).why
    expect(w.present).toBe(true)
    expect(w.referencesAttribute).toBe(true)
    expect(w.referencesRequirement).toBe(true)
  })

  it('a causal sentence with no requirement behind it is incomplete', () => {
    const noReq = `Mình nghiêng về **Quán Gần** vì nó đánh giá 4.6.`
    const w = analyze(noReq).why
    expect(w.present).toBe(true)
    expect(w.referencesAttribute).toBe(true)
    expect(w.referencesRequirement).toBe(false)
  })

  it('the generic reply explains nothing', () => {
    expect(analyze(GENERIC).why.present).toBe(false)
  })
})

describe('the Pick is detected, and checked against the BACKEND decision', () => {
  it('finds the leaned-to candidate and confirms it matches the ranker', () => {
    const p = analyze(GOOD).pick
    expect(p.present).toBe(true)
    expect(p.name).toBe('Quán Gần')
    expect(p.matchesBackendPick).toBe(true)
  })

  it('catches the model overriding the backend Pick — the §16 failure mode', () => {
    const overridden = `Vì bạn cần chỗ gần, mình nghiêng về **Quán Xa** vì đánh giá 4.9.`
    const p = analyze(overridden).pick
    expect(p.present).toBe(true)
    expect(p.name).toBe('Quán Xa')
    expect(p.matchesBackendPick).toBe(false)
  })

  it('reports no Pick when the reply only lists', () => {
    expect(analyze(GENERIC).pick.present).toBe(false)
  })
})

describe('the instrument works in English too', () => {
  const EN_NEED = profile({ priorities: [{ key: 'distance', weight: 2, source: 'stated' }], useCases: ['work'] })
  const EN_CANDIDATES = [
    place('Close Cafe', { rating: 4.6, reviewCount: 1200, distanceKm: 0.3, wifi: true }),
    place('Far Cafe', { rating: 4.9, reviewCount: 8000, distanceKm: 7.5 }),
  ]
  const EN_RANKED = rankCandidates(EN_CANDIDATES, EN_NEED)
  const EN_PICK = derivePick(EN_RANKED, EN_NEED)
  const EN_GOOD = `Found two spots for you.

**Close Cafe** is 0.3km away, rated 4.6, and has wifi so it works well for getting things done.
**Far Cafe** is rated 4.9 from 8000 reviews, noticeably higher, but it is 7.5km out.

Because you need somewhere close to work from, I'd go with **Close Cafe** — the trade-off is a slightly lower rating than Far Cafe.

How long are you planning to stay?`

  const a = analyzeConsultativeReply(EN_GOOD, { ranked: EN_RANKED, need: EN_NEED, pick: EN_PICK })

  it('detects the trade-off, the why and the pick in English', () => {
    expect(a.tradeoff.present).toBe(true)
    expect(a.tradeoff.userSpecific).toBe(true)
    expect(a.why.present).toBe(true)
    expect(a.why.referencesRequirement).toBe(true)
    expect(a.pick.name).toBe('Close Cafe')
    expect(a.pick.matchesBackendPick).toBe(true)
  })

  it('and reports symmetry and grounding', () => {
    expect(a.prosCons.balanced).toBe(true)
    expect(a.ungroundedClaims).toEqual([])
  })
})

// ── Found by LIVE prose acceptance, 2026-08-17 ──────────────────────────────
//
// Marketplace titles are long ("Laptop Asus Vivobook 16 A1607QA - MB067W (X1 26
// 100, 16GB/512GB)"), and a model naturally writes the short form ("Asus
// Vivobook 16 A1607QA"). Exact full-title matching therefore found NOTHING on a
// real reply — `candidatesMentioned` came back empty, which silently zeroed every
// downstream verdict and would have reported a genuinely good reply as having no
// pros/cons, no trade-off and no Pick.
describe('candidate matching tolerates the shortened names a model actually writes', () => {
  const LONG = [
    place('Laptop Asus Vivobook 16 A1607QA - MB067W (X1 26 100, 16GB/512GB)', { rating: 5, priceVnd: 18_590_000 }),
    place('Laptop Acer Aspire Lite 15 AL15-42P-R08M', { rating: 4.8, priceVnd: 16_990_000 }),
  ]
  const NEED = profile({ priorities: [{ key: 'price', weight: 2, source: 'stated' }] })
  const R = rankCandidates(LONG, NEED)
  const reply = `**Asus Vivobook 16 A1607QA** (18.59 triệu) rating 5⭐ là rẻ nhất.
Còn **Acer Aspire Lite 15** (16.99 triệu) rating 4.8⭐ thì nhỏ gọn hơn.`

  const a = analyzeConsultativeReply(reply, { ranked: R, need: NEED, pick: derivePick(R, NEED) })

  it('finds both candidates from their shortened forms', () => {
    expect(a.candidatesMentioned).toHaveLength(2)
  })

  it('and therefore the downstream verdicts are no longer vacuous', () => {
    expect(Object.keys(a.prosCons.perCandidate)).toHaveLength(2)
  })

  it('does NOT match on generic words alone', () => {
    // "Laptop" and a bare number must never be enough to claim a mention.
    const generic = analyzeConsultativeReply('Mình tìm được vài laptop 15 tốt.', { ranked: R, need: NEED, pick: null })
    expect(generic.candidatesMentioned).toEqual([])
  })

  it('does not confuse two similar products', () => {
    const onlyAcer = analyzeConsultativeReply('Chọn **Acer Aspire Lite 15** nhé.', { ranked: R, need: NEED, pick: null })
    expect(onlyAcer.candidatesMentioned).toEqual(['Laptop Acer Aspire Lite 15 AL15-42P-R08M'])
  })
})

// ── Found by live acceptance: the WHY measurement was too strict ────────────
//
// A real explanation routinely spans two sentences: one names the Pick, the next
// gives the reason without repeating the name. Requiring the candidate name in
// the SAME sentence as the causal clause reported a perfectly valid Why as
// absent. The product requirement is unchanged — a Why must still tie a real
// user requirement to real candidate evidence — only the measurement widens by
// exactly one sentence of context.
describe('WHY is detected when the reason continues into the next sentence', () => {
  const C = [
    place('Asus Vivobook 16 A1607QA', { rating: 5, priceVnd: 18_590_000 }),
    place('Acer Aspire Go 15 AG15-52P', { rating: 4.2, priceVnd: 22_490_000 }),
  ]
  const NEED = profile({
    priorities: [{ key: 'price', weight: 2, source: 'stated' }],
    budget: { min: 0, max: 30_000_000, type: 'under' },
    budgetStated: 30_000_000,
  })
  const R = rankCandidates(C, NEED)
  const P = derivePick(R, NEED)

  it('counts a causal clause in the sentence AFTER the one naming the Pick', () => {
    const reply = 'Mình nghiêng về **Asus Vivobook 16 A1607QA**. '
      + 'Vì ngân sách của bạn khoảng 30 triệu, giá 18.590.000đ và đánh giá 5 sao là hợp lý nhất.'
    const a = analyzeConsultativeReply(reply, { ranked: R, need: NEED, pick: P })
    expect(a.why.present).toBe(true)
    expect(a.why.referencesAttribute).toBe(true)
    expect(a.why.referencesRequirement).toBe(true)
  })

  it('EN: the same two-sentence shape', () => {
    const reply = "I'd go with **Asus Vivobook 16 A1607QA**. "
      + 'Because your budget is around 30 million, its 18,590,000 VND price and 5 rating fit best.'
    const a = analyzeConsultativeReply(reply, { ranked: R, need: NEED, pick: P })
    expect(a.why.present).toBe(true)
    expect(a.why.referencesRequirement).toBe(true)
  })

  it('does NOT count a causal clause with no candidate anywhere near it', () => {
    const a = analyzeConsultativeReply(
      'Chào bạn. Vì trời mưa nên bạn nên ở nhà.',
      { ranked: R, need: NEED, pick: P })
    expect(a.why.present).toBe(false)
  })

  it('the window is ONE sentence — it does not reach across a whole reply', () => {
    const reply = '**Asus Vivobook 16 A1607QA** giá 18.590.000đ. '
      + 'Ngoài ra còn nhiều mẫu khác. Bạn có thể xem thêm. '
      + 'Vì thời tiết đẹp nên đi mua trực tiếp cũng tiện.'
    const a = analyzeConsultativeReply(reply, { ranked: R, need: NEED, pick: P })
    expect(a.why.present).toBe(false)
  })
})

describe('the instrument is safe on degenerate input', () => {
  it('never throws', () => {
    for (const bad of ['', '   ', 'x'.repeat(5000), '[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]']) {
      expect(() => analyze(bad)).not.toThrow()
    }
  })

  it('ignores structured blocks and URLs, which are not prose', () => {
    // A marketplace URL contains digits and words that would otherwise read as
    // claims — the same scrubbing requirement the money guard already has.
    const withBlocks = `**Quán Gần** cách 0.3km.
[Xem trên Maps](https://www.google.com/maps/search/quan+gan+wifi+outdoor)
[CTA_BUTTONS]{"buttons":[{"label":"wifi outdoor","url":"https://x/y"}]}[/CTA_BUTTONS]
[FOLLOWUPS]có wifi không|ngoài trời|đánh giá cao[/FOLLOWUPS]`
    expect(analyze(withBlocks).ungroundedClaims).toEqual([])
  })

  it('is deterministic', () => {
    expect(analyze(GOOD)).toEqual(analyze(GOOD))
  })
})
