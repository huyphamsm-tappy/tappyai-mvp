import { describe, it, expect } from 'vitest'

// ── Gate 2 · F-1 (gate2/p18/P18-DECISIONS.json): "chỗ đậu xe" is not the ordinal "chỗ đầu" ──
//
// The ordinal table matches on FOLDED text, where "đậu" (park) and "đầu" (first) are the same "dau". "quán thứ hai có chỗ đậu xe
// không?" therefore also referred to the FIRST venue. A parking phrase must not be an ordinal; "quán đầu" / "chỗ đầu tiên" still are.

import { resolveReferences, ordinalVenuesFromContext, type PriorVenue } from './referenceResolver'

const CARDS = ['Cộng Cà Phê', 'The Workshop', 'Ròm Café']
const prior: PriorVenue[] = CARDS.map((name, i) => ({ index: i + 1, name }))
const ordinals = (text: string) => resolveReferences(text, prior).filter(r => r.kind === 'ordinal').flatMap(r => r.venues.map(v => v.name))

describe('F-1 — a parking phrase is not an ordinal', () => {
  it('"quán thứ hai có chỗ đậu xe máy không?" → only the second venue', () => {
    expect(ordinals('quán thứ hai có chỗ đậu xe máy không?')).toEqual(['The Workshop'])
    expect(ordinalVenuesFromContext('quán thứ hai có chỗ đậu xe máy không?', CARDS)).toEqual(['The Workshop'])
  })
  it('parking with no ordinal refers to no venue by position', () => {
    for (const q of ['có chỗ đậu xe không?', 'chỗ đậu ô tô ở đâu?', 'quán có chỗ đậu oto không', 'chỗ đậu xe hơi gần đó']) expect(ordinals(q)).toEqual([])
  })
  it('control: the first-venue ordinals still work', () => {
    for (const q of ['quán đầu có mở cửa không?', 'chỗ đầu tiên giá bao nhiêu?', 'quán đầu tiên mấy giờ đóng cửa?', 'chỗ đầu ở đâu?']) expect(ordinals(q)).toEqual(['Cộng Cà Phê'])
  })
})
