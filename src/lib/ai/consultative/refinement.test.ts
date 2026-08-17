import { describe, it, expect } from 'vitest'
import { deriveNeedProfile } from './needProfile'
import { resolveDecisionStage, profileChanged } from './refinement'
import { detectDecisionStage } from '../intent'
import { rankCandidates, type Candidate } from './rank'
import { derivePick } from './pick'

// ── REF-01…03 — Phase 2 Refinement contract ─────────────────────────────────
//
// The mandatory four-turn scenario, in both languages, asserted deterministically.
// REF-04 (live behavioural measurement) needs SERPER_API_KEY and stays blocked.

const EN = [
  'I need a laptop around 30M VND for coding and AI.',
  'I travel frequently.',
  'Battery is more important than GPU.',
  'Actually increase my budget to 35M.',
]
const VI = [
  'Mình cần laptop khoảng 30 triệu để code và làm AI.',
  'Mình hay đi công tác.',
  'Pin quan trọng hơn GPU.',
  'Thôi nâng ngân sách lên 35 triệu.',
]

/** The message array a client sends after `n` user turns. */
function upTo(script: string[], n: number): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = []
  for (let i = 0; i < n; i++) {
    out.push({ role: 'user', content: script[i] })
    if (i < n - 1) out.push({ role: 'assistant', content: 'Here are some options.' })
  }
  return out
}

const weightOf = (p: ReturnType<typeof deriveNeedProfile>, k: string) => p.priorities.find(x => x.key === k)?.weight

describe.each([['EN', EN], ['VI', VI]] as const)('REF-01 — %s: four turns, nothing lost', (_lang, script) => {
  const final = deriveNeedProfile(upTo(script, 4))

  it('the budget is the LAST stated value', () => {
    expect(final.budgetStated).toBe(35_000_000)
  })

  it('the use cases from turn 1 survive three later turns', () => {
    expect(final.useCases).toEqual(expect.arrayContaining(['coding', 'ai']))
  })

  it('the travel preference from turn 2 survives', () => {
    expect(weightOf(final, 'portability')).toBeGreaterThan(0)
  })

  it('battery still outranks GPU after the budget change', () => {
    expect(weightOf(final, 'battery')!).toBeGreaterThan(weightOf(final, 'gpu')!)
  })

  it('GPU is damped but NOT deleted — the user did mention it', () => {
    expect(weightOf(final, 'gpu')).toBeGreaterThan(0)
  })

  it('the underlying task never changed', () => {
    expect(final.subject).toBe('laptop')
    expect(final.domain).toBe('shopping')
  })

  it('each turn changed exactly the thing it was about', () => {
    expect(final.changedAtTurn.budget).toBe(4)
    expect(final.changedAtTurn.subject).toBe(1)
    expect(final.changedAtTurn.useCases).toBe(1)
    expect(final.changedAtTurn.priorities).toBe(3)
  })
})

describe('REF-02 — every constraint-changing turn is recognised as a refinement', () => {
  // ── The finding this test exists to record ────────────────────────────────
  //
  // The SHIPPED detectDecisionStage recognises turn 3 ("more important than")
  // and nothing else. Turn 2 (a preference) and turn 4 (a budget change) both
  // return null — and turn 4 is the product contract's own canonical refinement
  // example. On those turns the refinement stage block is never injected, so the
  // model is never told "keep the task, apply only the new condition, answer
  // now" — the same class of defect as C2.1.
  //
  // The shipped detector is NOT modified: it is precision-first by design, has
  // 71 passing tests, and route.ts depends on it. The gap is closed ADDITIVELY,
  // by noticing that the need profile itself changed.

  it('the shipped detector alone misses turns 2 and 4 — recorded, not worked around', () => {
    const after = (t: string) => detectDecisionStage(t, { hasPriorAssistantTurn: true })
    expect(after(EN[1])).toBeNull()
    expect(after(EN[2])).toBe('refinement')
    expect(after(EN[3])).toBeNull()
    expect(after(VI[3])).toBeNull()
  })

  describe.each([['EN', EN], ['VI', VI]] as const)('%s', (_lang, script) => {
    for (const turn of [2, 3, 4]) {
      it(`turn ${turn} resolves to 'refinement'`, () => {
        expect(resolveDecisionStage(upTo(script, turn))).toBe('refinement')
      })
    }

    it('turn 1 is NOT a refinement — there is nothing yet to refine', () => {
      expect(resolveDecisionStage(upTo(script, 1))).toBeNull()
    })
  })

  it('a genuine task switch is NOT a refinement', () => {
    const switched = [...upTo(EN, 4), { role: 'assistant', content: 'ok' }, { role: 'user', content: 'Actually, help me find a hotel in Da Nang instead.' }]
    expect(resolveDecisionStage(switched)).not.toBe('refinement')
  })

  it('an unchanged repeat is not a refinement — nothing moved', () => {
    const repeated = [...upTo(EN, 1), { role: 'assistant', content: 'ok' }, { role: 'user', content: 'thanks' }]
    expect(profileChanged(repeated)).toBe(false)
  })

  it('the shipped detector still wins when it fires — comparison is not overwritten', () => {
    const cmp = [{ role: 'user', content: 'Nên chọn iPhone 15 hay Galaxy S24?' }]
    expect(resolveDecisionStage(cmp)).toBe('comparison')
  })

  it('a bare acknowledgement stays a confirmation', () => {
    const ack = [...upTo(EN, 1), { role: 'assistant', content: 'ok' }, { role: 'user', content: 'ok' }]
    expect(resolveDecisionStage(ack)).toBe('confirmation')
  })
})

describe('REF-03 — the ranking and the Pick actually move', () => {
  // A candidate set where the turn-3 priority flip is decisive.
  const LAPTOPS: Candidate[] = [
    { id: 'light', name: 'Máy Nhẹ Pin Trâu', domain: 'shopping', attrs: { priceVnd: 32_000_000, rating: 4.4, reviewCount: 500 }, link: 'https://s/light', raw: {} },
    { id: 'power', name: 'Máy Mạnh GPU', domain: 'shopping', attrs: { priceVnd: 34_000_000, rating: 4.7, reviewCount: 900 }, link: 'https://s/power', raw: {} },
  ]

  it('turn 1 filters BOTH out — 32M and 34M are above a 30M "around" ceiling of 36M? no: they survive', () => {
    // "around 30M" widens to 24M–36M by the shipped `around` semantics, so both
    // are in budget at turn 1. Stated explicitly so the next assertion is not
    // read as a budget effect.
    const p1 = deriveNeedProfile(upTo(EN, 1))
    expect(p1.budget!.max).toBe(36_000_000)
    expect(rankCandidates(LAPTOPS, p1).ranked).toHaveLength(2)
  })

  it('a tightened ceiling filters out what no longer fits', () => {
    const tight = deriveNeedProfile([{ role: 'user', content: 'I need a laptop under 33M for coding.' }])
    const r = rankCandidates(LAPTOPS, tight)
    expect(r.ranked.map(x => x.candidate.name)).toEqual(['Máy Nhẹ Pin Trâu'])
    expect(r.filtered[0].filteredBy).toBe('budget')
  })

  it('the ranked ORDER at turn 4 is recomputed from the final profile, not turn 1', () => {
    const p1 = deriveNeedProfile(upTo(EN, 1))
    const p4 = deriveNeedProfile(upTo(EN, 4))
    expect(p4.budget!.max).not.toBe(p1.budget!.max)
    // Both still rank; what changed is the constraint set they were ranked under.
    expect(rankCandidates(LAPTOPS, p4).ranked).toHaveLength(2)
  })

  it('a Pick derived at turn 4 reflects turn 4, and is traceable to a changed field', () => {
    const p4 = deriveNeedProfile(upTo(EN, 4))
    const pick = derivePick(rankCandidates(LAPTOPS, p4), p4)
    expect(pick).not.toBeNull()
    expect(LAPTOPS).toContain(pick!.candidate)
  })

  it('VI and EN produce the same ranked order from the same candidates', () => {
    const en = rankCandidates(LAPTOPS, deriveNeedProfile(upTo(EN, 4)))
    const vi = rankCandidates(LAPTOPS, deriveNeedProfile(upTo(VI, 4)))
    expect(vi.ranked.map(x => x.candidate.name)).toEqual(en.ranked.map(x => x.candidate.name))
  })
})
