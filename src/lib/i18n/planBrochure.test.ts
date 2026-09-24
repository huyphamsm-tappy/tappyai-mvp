import { describe, it, expect } from 'vitest'
import { fill, planBrochureStrings } from './planBrochure'

// "1 days" on the English brochure (UAT 2026-09-24). Vietnamese has no plural and must not change.

describe('brochure counts read as English', () => {
  const en = planBrochureStrings('en')
  const vi = planBrochureStrings('vi')

  it('singular for one', () => {
    expect(fill(en.days, 1)).toBe('1 day')
    expect(fill(en.stops, 1)).toBe('1 stop')
    expect(fill(en.people, 1)).toBe('1 person')
    expect(fill(en.ogDescription, 1)).toBe('1 day · A plan from TappyAI')
  })

  it('plural otherwise', () => {
    expect(fill(en.days, 2)).toBe('2 days')
    expect(fill(en.stops, 5)).toBe('5 stops')
    expect(fill(en.people, 3)).toBe('3 people')
  })

  it('Vietnamese is untouched', () => {
    expect(fill(vi.days, 1)).toBe('1 ngày')
    expect(fill(vi.stops, 1)).toBe('1 điểm dừng')
  })
})
