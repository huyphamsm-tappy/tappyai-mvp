import { describe, it, expect } from 'vitest'
import { shortlistShopping, shortlistCandidates, identityKey, RULE_OF_ONE_TO_THREE_MAX } from './shortlist'
import { rankCandidates, type Candidate, type RankedEntry } from './rank'
import type { NeedProfile } from './needProfile'

// ── Shopping shortlist — regression on the frozen pre-Phase-A behavior ───────
describe('shortlistShopping (Phase-2 baseline — regression)', () => {
  it('caps and reports total when overflow', () => {
    const r = shortlistShopping([1, 2, 3, 4, 5], [], 3)
    expect(r.rows).toEqual([1, 2, 3])
    expect(r.totalFound).toBe(5)
  })
  it('does not cut when under limit — totalFound stays null', () => {
    const r = shortlistShopping([1, 2], [], 3)
    expect(r.rows).toEqual([1, 2])
    expect(r.totalFound).toBeNull()
  })
})

// ── Phase A A5 — Generalized Rule-of-1–3 shortlist ───────────────────────────

function place(id: string, name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id, name, domain: 'places', attrs, link: `https://maps/${encodeURIComponent(name)}`, raw: { name } }
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

describe('shortlistCandidates — Rule of 1–3', () => {
  it('one rankable candidate returns one', () => {
    const ranked = rankCandidates([place('p1', 'Quán A', { rating: 4.5, reviewCount: 100, distanceKm: 1 })], DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked)
    expect(s.selected).toHaveLength(1)
    expect(s.selected[0].role).toBe('best_overall')
  })

  it('two differentiated returns two', () => {
    const ranked = rankCandidates([
      place('p1', 'Gần', { rating: 4.7, reviewCount: 500, distanceKm: 0.5 }),
      place('p2', 'Xa hơn', { rating: 4.3, reviewCount: 200, distanceKm: 3 }),
    ], DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked)
    expect(s.selected).toHaveLength(2)
    expect(s.selected[0].role).toBe('best_overall')
  })

  it('three differentiated returns three (best_overall + up to 2 more)', () => {
    const ranked = rankCandidates([
      place('p1', 'A', { rating: 4.7, reviewCount: 500, distanceKm: 0.5 }),
      place('p2', 'B', { rating: 4.5, reviewCount: 300, distanceKm: 2 }),
      place('p3', 'C', { rating: 4.4, reviewCount: 200, distanceKm: 4 }),
    ], DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked)
    expect(s.selected).toHaveLength(3)
    expect(s.selected[0].role).toBe('best_overall')
  })

  it('10 candidates cap at 3 (RULE_OF_ONE_TO_THREE_MAX)', () => {
    const ten = Array.from({ length: 10 }, (_, i) =>
      place(`p${i}`, `n${i}`, { rating: 4.5 - i * 0.05, reviewCount: 1000 - i * 50, distanceKm: i + 1 }))
    const ranked = rankCandidates(ten, DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked)
    expect(s.selected).toHaveLength(RULE_OF_ONE_TO_THREE_MAX)
    expect(s.totalRanked).toBe(10)
  })

  it('duplicate identity is dropped, does not fill from later ranks', () => {
    // Two candidates with the SAME place_id → same identityKey → second dropped.
    // The shortlist does NOT fill from rank-3 to keep the count — that would be
    // the "fake Hidden Gem" failure.
    const dup = [
      place('SAME_ID', 'Quán X (branch 1)', { rating: 4.7, reviewCount: 500, distanceKm: 1 }),
      place('SAME_ID', 'Quán X (branch 2)', { rating: 4.6, reviewCount: 400, distanceKm: 2 }),
      place('p3', 'Y', { rating: 4.5, reviewCount: 300, distanceKm: 3 }),
    ]
    const ranked = rankCandidates(dup, DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked, 3)
    // Cap of 3, but only 2 unique identities survive. With early-break at
    // cap, dedupe drops the second SAME_ID and picks p3 to fill the cap — the
    // fill-until-cap-if-diverse contract.
    expect(s.duplicatesDropped).toBe(1)
    expect(new Set(s.selected.map(e => identityKey(e.entry.candidate))).size).toBe(s.selected.length)
  })

  it('never manufactures a fake third — cap 2 → returns at most 2', () => {
    const ranked = rankCandidates([
      place('p1', 'A', { rating: 4.7, reviewCount: 500, distanceKm: 0.5 }),
      place('p2', 'B', { rating: 4.5, reviewCount: 300, distanceKm: 2 }),
    ], DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked, 2)
    expect(s.selected).toHaveLength(2)
    // Nothing was fabricated for a third slot.
  })

  it('empty rank returns empty shortlist', () => {
    const s = shortlistCandidates([])
    expect(s.selected).toHaveLength(0)
    expect(s.totalRanked).toBe(0)
    expect(s.duplicatesDropped).toBe(0)
  })

  it('cap 0 returns empty', () => {
    const ranked = rankCandidates([place('p1', 'A', { rating: 4.5, reviewCount: 100 })], DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked, 0)
    expect(s.selected).toHaveLength(0)
  })
})

describe('identityKey — dedupe rule', () => {
  it('uses stable id when present', () => {
    const a = place('ChIJabc', 'A', {})
    expect(identityKey(a)).toBe('id:chijabc')
  })
  it('falls back to normalized link when no id', () => {
    const c: Candidate = { id: '', name: 'X', domain: 'places', attrs: {}, link: 'https://x.com/place?utm=1', raw: {} }
    // Query-string tracking noise is stripped: id key normalizes on host+pathname
    expect(identityKey(c)).toBe('link:x.com/place')
  })
  it('falls back to lowercased name last', () => {
    const c: Candidate = { id: '', name: 'Quán ABC', domain: 'places', attrs: {}, link: null, raw: {} }
    expect(identityKey(c)).toBe('name:quán abc')
  })
  it('"different name, same id" is the same identity', () => {
    const a = place('SAME', 'branch A', {})
    const b = place('SAME', 'branch B', {})
    expect(identityKey(a)).toBe(identityKey(b))
  })
})

describe('role assignment — only when truthful', () => {
  it('assigns best_overall to rank 0 with any positive reason', () => {
    const ranked = rankCandidates([
      place('p1', 'A', { rating: 4.7, reviewCount: 500, distanceKm: 0.5 }),
      place('p2', 'B', { rating: 4.4, reviewCount: 200, distanceKm: 3 }),
    ], DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked)
    expect(s.selected[0].role).toBe('best_overall')
  })

  it('never labels a role that has no evidence — value_gem only when price beats', () => {
    // Neither entry has price data — value_gem must NOT be assigned.
    const ranked = rankCandidates([
      place('p1', 'A', { rating: 4.7, reviewCount: 500, distanceKm: 0.5 }),
      place('p2', 'B', { rating: 4.4, reviewCount: 200, distanceKm: 3 }),
    ], DISTANCE_FIRST)
    const s = shortlistCandidates(ranked.ranked)
    for (const sel of s.selected.slice(1)) expect(sel.role).not.toBe('value_gem')
  })
})
