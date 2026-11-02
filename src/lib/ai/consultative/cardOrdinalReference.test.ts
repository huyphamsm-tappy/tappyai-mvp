import { describe, it, expect } from 'vitest'

// ── Gate 2 L4 C5: an ORDINAL question resolves against the stored cards in the canned-reply path and the V1 block ──
//
// gate2/l4/L4-ADDENDUM-C5.md. Before: both paths read "quán thứ hai" against the bold names of the previous reply (priorVenuesIn),
// which de-duplicates by name -- with two branches of one chain the second card the user saw became the next DIFFERENT name.
// After: when the state holds the cards and the previous reply names one of them, an ordinal is read against the cards; every other
// reference (a name, "cả hai", "quán này") still reads the prose. `referencedWithCards` is new, so this file fails at Step 0 by design
// (kept apart so the other L4 tests' Step 0 result is not masked).

import { priorVenuesIn, resolveReferences, referencedVenues, referencedWithCards } from './referenceResolver'

const TB_REPLY = 'Mình gợi ý **Highlands Coffee** (Lê Lợi), **Highlands Coffee** (Nguyễn Huệ) và **Phúc Long** cho bạn.'
const TB_CARDS = ['Highlands Coffee', 'Highlands Coffee', 'Phúc Long']
const names = (v: ReadonlyArray<{ name: string }>) => v.map(x => x.name)

describe('LT-10 — referencedWithCards: ordinals follow the cards, names follow the prose', () => {
  const prior = priorVenuesIn(TB_REPLY)
  it('the prose list is de-duplicated (the reason this exists)', () => {
    expect(names(prior)).toEqual(['Highlands Coffee', 'Phúc Long'])
  })
  it('"thứ hai" → the second card (the second Highlands branch); "thứ ba" → Phúc Long', () => {
    expect(names(referencedWithCards('Quán thứ hai mở cửa mấy giờ?', prior, TB_CARDS))).toEqual(['Highlands Coffee'])
    expect(referencedWithCards('Quán thứ hai mở cửa mấy giờ?', prior, TB_CARDS)[0].index).toBe(2)
    expect(names(referencedWithCards('Quán thứ ba mở cửa mấy giờ?', prior, TB_CARDS))).toEqual(['Phúc Long'])
  })
  it('a reference by name still reads the prose', () => {
    expect(names(referencedWithCards('Phúc Long thì sao?', prior, TB_CARDS))).toEqual(['Phúc Long'])
  })
})

describe('LT-12 — control: stale cards (the previous reply is about other venues) do not take over', () => {
  it('"thứ hai" → the second venue of the prose', () => {
    const prior = priorVenuesIn('Bạn có thể thử **Bánh Mì Huỳnh Hoa** hoặc **Bánh Mì Hồng Hoa** nhé.')
    expect(names(referencedWithCards('Quán thứ hai ở đâu?', prior, ['Quán A', 'Quán B', 'Quán C']))).toEqual(['Bánh Mì Hồng Hoa'])
  })
})

describe('LT-13 — control: without cards it is exactly the old resolution', () => {
  for (const q of ['Quán thứ hai mở cửa mấy giờ?', 'Phúc Long thì sao?', 'Cả hai quán này có wifi không?', 'Quán này có mở cửa không?']) {
    it(q, () => {
      const prior = priorVenuesIn(TB_REPLY)
      expect(referencedWithCards(q, prior, undefined)).toEqual(referencedVenues(resolveReferences(q, prior)))
      expect(referencedWithCards(q, prior, [])).toEqual(referencedVenues(resolveReferences(q, prior)))
    })
  }
})
