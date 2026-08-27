import { describe, it, expect } from 'vitest'
import { buildSystem } from '../promptBuilder'
import { shortlistCandidates } from './shortlist'
import { rankCandidates, type Candidate } from './rank'
import { derivePick } from './pick'
import type { NeedProfile } from './needProfile'

// ── Phase A.5 — Decision Quality contract ────────────────────────────────────
//
// Locks the rules the model must follow when the deterministic engine has
// already produced a Pick and shortlist. Each test names a specific failure
// mode from the Phase-A.5 owner brief.

const base = () => buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

function place(id: string, name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id, name, domain: 'places', attrs, link: `https://maps/${name}`, raw: { name } }
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
const DISTANCE_FIRST = profile({ priorities: [{ key: 'distance', weight: 2, source: 'stated' }] })

describe('DQ-01 — clear winner triggers a decision-first opening', () => {
  it('R1b forbids opening with "Minh tim duoc vai quan"', () => {
    const { shared } = base()
    expect(shared).toMatch(/DECISION-FIRST OPENING/)
    // The specific dumb-opener phrases are named and banned.
    expect(shared).toMatch(/Minh tim duoc vai/)
    expect(shared).toMatch(/Day la vai lua chon/)
  })

  it('R1b tells the model the opening sentence MUST name a specific pick', () => {
    const { shared } = base()
    expect(shared).toMatch(/CAU DAU TIEN.*PHAI la mot cau CHON/)
    expect(shared).toMatch(/Minh chon X.*Y|Neu la minh thi minh chon/)
  })
})

describe('DQ-03 — one candidate returns one, not a fake trio', () => {
  it('R1b bans fabricating a third candidate to fill a UI quota', () => {
    const { shared } = base()
    expect(shared).toMatch(/RULE 1-2-3 KHONG PHAI QUOTA UI/)
    expect(shared).toMatch(/KHONG duoc bia phuong an C/)
  })

  it('deterministic — shortlist of a lone rankable candidate returns 1', () => {
    const one = [place('p1', 'Duy Nhất', { rating: 4.7, reviewCount: 500, distanceKm: 0.5 })]
    const ranked = rankCandidates(one, DISTANCE_FIRST)
    const sl = shortlistCandidates(ranked.ranked)
    expect(sl.selected).toHaveLength(1)
  })
})

describe('DQ-04 — missing non-critical preference does not force clarification', () => {
  it('the ranker fires when the user only expressed purchase intent, not criteria', () => {
    // "muốn mua ốp lưng" — no priority, no budget, no must-have. With the
    // implicit-purchase-intent signal (Round 1) the ranker DOES produce a Pick.
    const two = [
      place('p1', 'Ốp A', { rating: 4.9, reviewCount: 200, priceVnd: 500_000 }),
      place('p2', 'Ốp B', { rating: 4.6, reviewCount: 100, priceVnd: 800_000 }),
    ]
    const need = profile()
    const ranked = rankCandidates(two, need)
    // Without the signal, the receptionist reply — no Pick.
    expect(derivePick(ranked, need)).toBeNull()
    // With the signal, the ranker's default (rating × review) is decidable.
    const withSignal = derivePick(ranked, need, { implicitPurchaseIntent: true })
    expect(withSignal).not.toBeNull()
    expect(withSignal!.candidate.name).toBe('Ốp A')
  })
})

describe('DQ-06 — factual follow-up does not trigger recommendation cards', () => {
  it('the intent gate + sanitizer combination is unit-verified elsewhere', () => {
    // Cross-reference locks: intentGate.test.ts + sanitizePriorAssistantContent.test.ts +
    // phaseAFinal.test.ts already own this contract. This is a signpost.
    expect(true).toBe(true)
  })
})

describe('DQ-08 — comparison of two named options produces a winner, not a list', () => {
  it('R1b DECISION-FIRST OPENING covers "giữa A và B" too', () => {
    const { shared } = base()
    // When shortlist has 2 items and one is best_overall, the opening rule
    // still requires naming that pick specifically.
    expect(shared).toMatch(/DECISION-FIRST OPENING/)
    expect(shared).toMatch(/shortlist\[0\]\.role = 'best_overall'/)
  })
})

describe('DQ-11 — weak third alternative is dropped, never fabricated', () => {
  it('shortlist stops at meaningful candidates', () => {
    // Duplicate identity in third slot: shortlist skips the dup and does not
    // fill from the tail. The test in shortlist.test.ts covers this end-to-end.
    const dup = [
      place('A', 'A1', { rating: 4.9, reviewCount: 1000, distanceKm: 0.5 }),
      place('A', 'A2', { rating: 4.8, reviewCount: 900, distanceKm: 1 }),
    ]
    const ranked = rankCandidates(dup, DISTANCE_FIRST)
    const sl = shortlistCandidates(ranked.ranked, 3)
    // Only one unique identity survives — the shortlist returns 1, not 3.
    expect(sl.selected).toHaveLength(1)
    expect(sl.duplicatesDropped).toBe(1)
  })
})

describe('DQ-12 — evidence must be converted into a decision, not restated', () => {
  it('R1b requires "EVIDENCE → REASONING" not evidence dumping', () => {
    const { shared } = base()
    expect(shared).toMatch(/EVIDENCE.{0,20}REASONING/)
    expect(shared).toMatch(/KHONG duoc noi "4\.9⭐/)
    expect(shared).toMatch(/Vi ban uu tien/)
  })
})

describe('DQ regression — Round-2 winning behaviour survives the DQ tightening', () => {
  it('the recommendation contract R1 shape lock is unaffected', () => {
    const { shared } = base()
    expect(shared).toContain('R1: CACH GOI Y & GIUP QUYET DINH')
    // The old R1 markers must still exist.
    for (const marker of ['2-4', 'KHAC BIET', 'LY DO', 'DANH DOI', 'NGHIENG VE']) {
      expect(shared).toContain(marker)
    }
  })

  it('R1b tightening did not accidentally remove `_tappy_shortlist` binding', () => {
    const { shared } = base()
    expect(shared).toContain('_tappy_shortlist')
    expect(shared).toContain('_tappy_relaxation')
  })
})
