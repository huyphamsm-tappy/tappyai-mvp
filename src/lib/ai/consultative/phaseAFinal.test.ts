import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSystem } from '../promptBuilder'
import { classifyTurnIntent, shouldRunRetrieval, shouldRenderCards } from './intentGate'
import { shortlistCandidates } from './shortlist'
import { rankCandidates, type Candidate } from './rank'
import type { NeedProfile } from './needProfile'

// ── Phase A finalization — end-to-end contract tests ─────────────────────────
//
// This file locks the finalized Phase-A contract WITHOUT re-testing the pieces
// individually (those are in shortlist.test.ts / relaxation.test.ts / etc.).
// It asserts:
//   1. The prompt actually references `_tappy_shortlist` and `_tappy_relaxation`
//      — so the model is structurally bound to them, not just aware of them
//      in principle.
//   2. The intent gate's follow-up branch prevents card re-render
//      (the class of bug fixed in Round 1).
//   3. Round 1's `sanitizePriorAssistantContent` is still applied to prior
//      assistant text before the LLM sees it (belt-and-braces with the intent
//      gate).
//   4. Rule-of-1–3 enforcement: 20 candidates → at most 3 selected, with
//      dedupe-by-identity preserved.

const base = () => buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

describe('Phase A finalization — prompt binds the model to the deterministic core', () => {
  it('R1b tells the model to use `_tappy_shortlist` and forbids re-ranking', () => {
    const { shared } = base()
    expect(shared).toMatch(/R1b/)
    expect(shared).toContain('_tappy_shortlist')
    expect(shared).toMatch(/KHONG.{0,10}re-rank|KHONG.{0,10}chon random|TUYET DOI KHONG chon random/i)
  })

  it('R1b tells the model to surface `_tappy_relaxation` and never silently apply', () => {
    const { shared } = base()
    expect(shared).toContain('_tappy_relaxation')
    expect(shared).toMatch(/xac nhan|user chon|TUYET DOI KHONG tu dong sua/i)
  })

  it('rule 18b still binds review actions to structured data', () => {
    const { shared } = base()
    expect(shared).toMatch(/^18b\) REVIEW/m)
    expect(shared).toContain('review_actions')
  })
})

describe('Phase A finalization — intent gate contract', () => {
  it('a factual follow-up NEVER triggers retrieval or card render', () => {
    const intent = classifyTurnIntent({
      stage: 'decision',
      hasPriorAssistantTurn: true,
      taskSwitched: false,
      assistantAskedClarification: false,
    })
    expect(intent).toBe('follow_up_question')
    expect(shouldRunRetrieval(intent)).toBe(false)
    expect(shouldRenderCards(intent)).toBe(false)
  })

  it('a refinement CAN trigger retrieval and cards', () => {
    const intent = classifyTurnIntent({
      stage: 'refinement',
      hasPriorAssistantTurn: true,
      taskSwitched: false,
      assistantAskedClarification: false,
    })
    expect(intent).toBe('refinement')
    expect(shouldRunRetrieval(intent)).toBe(true)
    expect(shouldRenderCards(intent)).toBe(true)
  })

  it('a clarification response continues consultation but does NOT re-render cards on this turn', () => {
    const intent = classifyTurnIntent({
      stage: 'refinement',
      hasPriorAssistantTurn: true,
      taskSwitched: false,
      assistantAskedClarification: true,
    })
    expect(intent).toBe('clarification_response')
    expect(shouldRunRetrieval(intent)).toBe(true)
    // Clarification response merges into state; the NEXT turn is where cards
    // may render (as a fresh new_consultation with the folded answer).
    expect(shouldRenderCards(intent)).toBe(false)
  })

  it('a task-switch resets to new_consultation even with prior assistant history', () => {
    const intent = classifyTurnIntent({
      stage: 'refinement',
      hasPriorAssistantTurn: true,
      taskSwitched: true,
      assistantAskedClarification: false,
    })
    expect(intent).toBe('new_consultation')
    expect(shouldRunRetrieval(intent)).toBe(true)
    expect(shouldRenderCards(intent)).toBe(true)
  })
})

describe('Phase A finalization — Round 1 sanitizer is still active on the input side', () => {
  it('sanitizePriorAssistantContent is imported and used by the chat route', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toContain('sanitizePriorAssistantContent')
    expect(route).toMatch(/modelMessages\s*=/) // the sanitized-copy variable
  })
})

describe('Phase A finalization — Rule of 1–3 hard enforcement', () => {
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

  it('20 ranked candidates → shortlist selects AT MOST 3 (never 5)', () => {
    const twenty = Array.from({ length: 20 }, (_, i) =>
      place(`p${i}`, `n${i}`, { rating: 4.9 - i * 0.03, reviewCount: 2000 - i * 50, distanceKm: 0.5 + i * 0.5 }))
    const ranked = rankCandidates(twenty, DISTANCE_FIRST)
    const sl = shortlistCandidates(ranked.ranked, 3)
    expect(sl.selected.length).toBeLessThanOrEqual(3)
    expect(sl.totalRanked).toBe(20)
  })

  it('duplicate identities collapse — never manufactures a third from the tail', () => {
    // Two candidates share `SAME_ID`, then a third unique. Cap=2 → we select 2
    // unique (the first `SAME_ID` and the unique). Cap=3 → we would fill from
    // the unique, still 2 distinct IDs preserved.
    const dup = [
      place('SAME', 'A', { rating: 4.9, reviewCount: 1000, distanceKm: 0.5 }),
      place('SAME', 'A2', { rating: 4.8, reviewCount: 900, distanceKm: 1 }),
      place('DIFF', 'B', { rating: 4.6, reviewCount: 500, distanceKm: 2 }),
    ]
    const ranked = rankCandidates(dup, DISTANCE_FIRST)
    const sl = shortlistCandidates(ranked.ranked, 3)
    const uniqueIds = new Set(sl.selected.map(s => s.entry.candidate.id))
    expect(uniqueIds.size).toBe(sl.selected.length)
    expect(sl.duplicatesDropped).toBe(1)
  })
})
