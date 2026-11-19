import { describe, it, expect } from 'vitest'
import { sumCosts } from './planCosts'

describe('sumCosts', () => {
  it('adds the lines, group and per-person, and writes the total the lines add up to', () => {
    const r = sumCosts([
      { item: 'Coach', low: 600_000, high: 900_000, per_person: true },
      { item: 'Stay 2 nights', low: 1_400_000 },
      { item: 'Food', low: 1_100_000, high: 1_300_000, per_person: true, note: 'local food' },
    ], 2, 'en')
    expect(r).not.toBeNull()
    expect(r!.totalLow).toBe(600_000 * 2 + 1_400_000 + 1_100_000 * 2)
    expect(r!.totalHigh).toBe(900_000 * 2 + 1_400_000 + 1_300_000 * 2)
    expect(r!.cost_breakdown['Coach']).toBe('1,200,000-1,800,000 VND (600,000-900,000 VND × 2)')
    expect(r!.cost_breakdown['Stay 2 nights']).toBe('1,400,000 VND')
    expect(r!.cost_breakdown['Food']).toContain('2,200,000-2,600,000 VND')
    expect(r!.cost_breakdown['Food']).toContain('local food')
    expect(r!.budget_total).toBe('4,800,000-5,800,000 VND (2,400,000-2,900,000 VND per person)')
  })
  it('one traveller: no per-person remark; a single figure is not a range', () => {
    const r = sumCosts([{ item: 'Ticket', low: 500_000 }], 1, 'en')
    expect(r!.budget_total).toBe('500,000 VND')
  })
  it('lines without a usable amount are skipped; none usable gives null; the same item twice keeps both', () => {
    expect(sumCosts([{ item: 'x', low: -5 }, { item: '', low: 10 }, { item: 'y', low: Number.NaN }], 2)).toBeNull()
    expect(sumCosts(undefined, 2)).toBeNull()
    const r = sumCosts([{ item: 'Meal', low: 100_000 }, { item: 'Meal', low: 200_000 }], 1, 'en')
    expect(Object.keys(r!.cost_breakdown)).toHaveLength(2)
    expect(r!.totalLow).toBe(300_000)
  })
  it('a high below the low is ignored (the low stands); Vietnamese wording and the dong sign', () => {
    const r = sumCosts([{ item: 'a', low: 1_000_000, high: 500_000 }], 2, 'vi')
    expect(r!.totalHigh).toBe(1_000_000)
    expect(r!.budget_total).toContain('1.000.000')
    expect(r!.budget_total).toContain('/')
  })
})
