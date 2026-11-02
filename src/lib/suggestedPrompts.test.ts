import { describe, it, expect } from 'vitest'
import { getDynamicPrompts, diversifyByCategory } from './suggestedPrompts'

const HOURS = [6, 12, 15, 18, 22]
const DAYS = [1, 4, 6]
const GENDERS = [null, 'male', 'female'] as const

describe('getDynamicPrompts diversity (BUG 7)', () => {
  it('never shows more than 2 of one vertical, never adjacent repeats, across time/day/gender/random', () => {
    for (let run = 0; run < 40; run++) {
      for (const h of HOURS) for (const d of DAYS) for (const g of GENDERS) {
        const out = getDynamicPrompts(h, d, null, g, 5)
        expect(out).toHaveLength(5)
        const cats = out.map(p => p.category)
        // 5 slots, all 5 verticals available -> a full mix every time
        expect(new Set(cats).size).toBe(5)
        for (let i = 1; i < cats.length; i++) expect(cats[i]).not.toBe(cats[i - 1])
        expect(new Set(out.map(p => p.text)).size).toBe(5)
      }
    }
  })

  it('keeps count=4 diverse too', () => {
    for (let i = 0; i < 40; i++) {
      const cats = getDynamicPrompts(12, 2, null, null, 4).map(p => p.category)
      expect(new Set(cats).size).toBe(4)
    }
  })

  it('still honours the spa memory signal', () => {
    const out = getDynamicPrompts(12, 2, { preferences: { spa: ['x'] }, history: [] } as never, null, 5)
    expect(out.some(p => p.category === 'spa')).toBe(true)
  })

  it('diversifyByCategory interleaves when a vertical is dominant', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => ({ category: 'food' as const, i })),
      { category: 'travel' as const, i: 0 },
      { category: 'shopping' as const, i: 0 },
    ]
    const out = diversifyByCategory(items, 5)
    expect(out).toHaveLength(5)
    expect(new Set(out.map(o => o.category)).size).toBe(3)
    // the first lap visits every available vertical before any repeats
    expect(new Set(out.slice(0, 3).map(o => o.category)).size).toBe(3)
  })
})
