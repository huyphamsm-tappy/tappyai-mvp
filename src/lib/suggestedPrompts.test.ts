import { describe, it, expect } from 'vitest'
import { getDynamicPrompts, diversifyByCategory } from './suggestedPrompts'

const HOURS = [6, 12, 15, 18, 22]
const DAYS = [1, 4, 6]
const GENDERS = [null, 'male', 'female'] as const

describe('getDynamicPrompts diversity (BUG 7) — the verticals are tools, not the scope: at least half the strip is any-topic', () => {
  it('count 5: 3 any-topic + 2 different verticals, never adjacent repeats, unique texts, across time/day/gender/random', () => {
    for (let run = 0; run < 40; run++) {
      for (const h of HOURS) for (const d of DAYS) for (const g of GENDERS) {
        const out = getDynamicPrompts(h, d, null, g, 5)
        expect(out).toHaveLength(5)
        const cats = out.map(p => p.category)
        expect(cats.filter(c => c === 'general')).toHaveLength(3)
        const verticals = cats.filter(c => c !== 'general')
        expect(new Set(verticals).size).toBe(verticals.length)
        for (let i = 1; i < cats.length; i++) expect(cats[i]).not.toBe(cats[i - 1])
        expect(new Set(out.map(p => p.text)).size).toBe(5)
      }
    }
  })

  it('count 4 and 3 keep at least half any-topic and diverse verticals', () => {
    for (let i = 0; i < 40; i++) {
      const four = getDynamicPrompts(12, 2, null, null, 4).map(p => p.category)
      expect(four.filter(c => c === 'general')).toHaveLength(2)
      expect(new Set(four.filter(c => c !== 'general')).size).toBe(2)
      const three = getDynamicPrompts(12, 2, null, null, 3).map(p => p.category)
      expect(three.filter(c => c === 'general').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('any-topic prompts name no venue or service as the subject (they are advice / work / study / money / knowledge)', () => {
    for (let i = 0; i < 60; i++) {
      for (const p of getDynamicPrompts(12, 2, null, null, 5).filter(x => x.category === 'general')) {
        expect(p.text).not.toMatch(/(quán|nhà hàng|spa|massage|karaoke|bar |khách sạn)/i)
        expect(p.textEn.length).toBeGreaterThan(5)
      }
    }
  })

  it('still honours the spa memory signal', () => {
    for (let i = 0; i < 20; i++) {
      const out = getDynamicPrompts(12, 2, { preferences: { spa: ['x'] }, history: [] } as never, null, 5)
      expect(out.some(p => p.category === 'spa')).toBe(true)
    }
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
