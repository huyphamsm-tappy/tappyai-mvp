import { describe, it, expect } from 'vitest'
import { planMarkdown } from './planMarkdown'

const L = { facts: '2 days', budget: 'Budget', item: 'Item', cost: 'Cost', tips: 'Tips', total: 'Total', stays: 'Where to stay', dishes: 'What to try' }
const plan = (extra: Record<string, unknown>) => ({ type: 'trip', title: 'Hanoi', days: [{ label: 'Day 1', items: [{ time: '09:00', name: 'Old Quarter' }] }], ...extra }) as never

describe('planMarkdown: where to stay and what to eat', () => {
  it('writes a section for the stays and one for the dishes, from the plan fields only', () => {
    const m = planMarkdown(plan({
      stays: [{ name: 'Hotel A', why: 'Near the lake', price: '1.250.000d/dem', address: '1 Road' }],
      dishes: [{ dish: 'Bun cha', venue: 'Huong Lien', address: '24 Le Van Huu', price: '60.000d', note: 'with nem cua be' }],
    }), L)
    expect(m).toContain('## Where to stay')
    expect(m).toContain('- **Hotel A** - Near the lake 1.250.000d/dem 1 Road')
    expect(m).toContain('## What to try')
    expect(m).toContain('- **Bun cha** - Huong Lien 24 Le Van Huu 60.000d with nem cua be')
  })
  it('a plan without them has neither section, and without the labels nothing is added', () => {
    const none = planMarkdown(plan({}), L)
    expect(none).not.toContain('Where to stay')
    expect(none).not.toContain('What to try')
    const old = planMarkdown(plan({ stays: [{ name: 'Hotel A' }] }), { facts: '', budget: 'B', item: 'I', cost: 'C', tips: 'T', total: 'Tt' })
    expect(old).not.toContain('Hotel A')
  })
  it('the sections come after the days and before the budget', () => {
    const m = planMarkdown(plan({ stays: [{ name: 'Hotel A' }], budget_total: '1', cost_breakdown: { A: '1' } }), L)
    expect(m.indexOf('## Day 1')).toBeLessThan(m.indexOf('## Where to stay'))
    expect(m.indexOf('## Where to stay')).toBeLessThan(m.indexOf('## Budget'))
  })
})
