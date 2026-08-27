import { describe, it, expect } from 'vitest'
import { proposeRelaxation, applyRelaxation } from './relaxation'
import { rankCandidates, type Candidate } from './rank'
import type { NeedProfile } from './needProfile'

function place(name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id: name, name, domain: 'places', attrs, link: `https://maps/${encodeURIComponent(name)}`, raw: { name } }
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

describe('proposeRelaxation — Phase A A8', () => {
  it('non-triggered when there is a survivor', () => {
    const need = profile({ budget: { min: 0, max: 500_000, type: 'under' as const } })
    const ranked = rankCandidates([
      place('OK', { priceVnd: 400_000, rating: 4.5, reviewCount: 100 }),
      place('OVER', { priceVnd: 800_000, rating: 4.7, reviewCount: 300 }),
    ], need)
    const proposal = proposeRelaxation(ranked, need)
    expect(proposal.triggered).toBe(false)
    expect(proposal.options).toHaveLength(0)
  })

  it('triggered when budget removes every candidate — proposes the cheapest over-ceiling price', () => {
    const need = profile({ budget: { min: 0, max: 500_000, type: 'under' as const } })
    const ranked = rankCandidates([
      place('A', { priceVnd: 650_000, rating: 4.7, reviewCount: 500 }),
      place('B', { priceVnd: 800_000, rating: 4.6, reviewCount: 300 }),
    ], need)
    const proposal = proposeRelaxation(ranked, need)
    expect(proposal.triggered).toBe(true)
    expect(proposal.options).toHaveLength(1)
    const opt = proposal.options[0]
    expect(opt.axis).toBe('budget')
    expect(opt.newValue).toBe(650_000)   // cheapest over-ceiling, NOT invented "+20%"
    expect(opt.admits.length).toBeGreaterThan(0)
  })

  it('proposes mustHave relaxation naming the specific constraint', () => {
    const need = profile({ mustHave: ['wifi'] })
    const ranked = rankCandidates([
      place('NoWifi', { rating: 4.7, reviewCount: 500, wifi: false }),
      place('AlsoNoWifi', { rating: 4.5, reviewCount: 300, wifi: false }),
    ], need)
    const proposal = proposeRelaxation(ranked, need)
    expect(proposal.triggered).toBe(true)
    const opt = proposal.options[0]
    expect(opt.axis).toBe('mustHave')
    expect(opt.newValue).toBe('wifi')
    expect(opt.admits.length).toBeGreaterThan(0)
  })

  it('never invents a value — no over-ceiling candidate ⇒ no budget option', () => {
    // Filtered by mustHave, not by budget. Budget proposal must NOT appear even
    // though a budget was set — the axis wasn't the blocker.
    const need = profile({
      budget: { min: 0, max: 500_000, type: 'under' as const },
      mustHave: ['wifi'],
    })
    const ranked = rankCandidates([
      place('OK price no wifi', { priceVnd: 300_000, rating: 4.7, reviewCount: 500, wifi: false }),
    ], need)
    const proposal = proposeRelaxation(ranked, need)
    expect(proposal.options.every(o => o.axis !== 'budget')).toBe(true)
  })

  it('does not fire when the ranker had no candidates at all', () => {
    const need = profile()
    const ranked = rankCandidates([], need)
    const proposal = proposeRelaxation(ranked, need)
    expect(proposal.triggered).toBe(false)
  })
})

describe('applyRelaxation — pure state transform', () => {
  it('budget: raises the ceiling to the proposed number', () => {
    const need = profile({ budget: { min: 0, max: 500_000, type: 'under' as const } })
    const next = applyRelaxation(need, { axis: 'budget', detail: '', newValue: 650_000, admits: [] })
    expect(next.budget?.max).toBe(650_000)
    // Preserves min and type
    expect(next.budget?.type).toBe('under')
    expect(next.budget?.min).toBe(0)
  })

  it('mustHave: drops the constraint, leaves others', () => {
    const need = profile({ mustHave: ['wifi', 'outdoor'] })
    const next = applyRelaxation(need, { axis: 'mustHave', detail: '', newValue: 'wifi', admits: [] })
    expect(next.mustHave).toEqual(['outdoor'])
  })

  it('avoid: drops the exclusion, leaves others', () => {
    const need = profile({ avoid: ['non-vegetarian', 'spicy'] })
    const next = applyRelaxation(need, { axis: 'avoid', detail: '', newValue: 'non-vegetarian', admits: [] })
    expect(next.avoid).toEqual(['spicy'])
  })

  it('applying an option twice is idempotent for mustHave/avoid', () => {
    const need = profile({ mustHave: ['wifi'] })
    const once = applyRelaxation(need, { axis: 'mustHave', detail: '', newValue: 'wifi', admits: [] })
    const twice = applyRelaxation(once, { axis: 'mustHave', detail: '', newValue: 'wifi', admits: [] })
    expect(twice.mustHave).toEqual([])
  })
})
