// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { assignCardArt } from './HomeV3'

// Owner 21/11/2026: "content one place, picture another". A card outside the five photographed categories
// (`general`: money, work, study, personal decisions) must never borrow a food/travel photograph.
describe('art for general (non-photographed) categories', () => {
  it('a general card gets a Tappy mascot pose, never a category photograph', () => {
    const art = assignCardArt([{ category: 'general' }, { category: 'food' }, { category: 'general' }, { category: 'travel' }, { category: 'general' }])
    expect(art[0]).toMatch(/^\/tappy\/[a-z]+\.png$/)
    expect(art[2]).toMatch(/^\/tappy\/[a-z]+\.png$/)
    expect(art[4]).toMatch(/^\/tappy\/[a-z]+\.png$/)
    expect(art[1]).toMatch(/^\/home\/inspire\/food/)
    expect(art[3]).toMatch(/^\/home\/inspire\/travel/)
  })
  it('the mascot poses differ between general cards and do not depend on the words', () => {
    const art = assignCardArt([{ category: 'general' }, { category: 'general' }, { category: 'general' }])
    expect(new Set(art).size).toBe(3)
    expect(assignCardArt([{ category: 'general' }, { category: 'general' }, { category: 'general' }])).toEqual(art)
  })
  it('five general cards never touch the photo pool', () => {
    const art = assignCardArt(Array.from({ length: 5 }, () => ({ category: 'general' })))
    expect(art.every((a) => a.startsWith('/tappy/'))).toBe(true)
  })
})
