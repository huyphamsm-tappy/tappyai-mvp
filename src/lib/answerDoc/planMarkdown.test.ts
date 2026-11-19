import { describe, it, expect } from 'vitest'
import { planMarkdown } from './planMarkdown'
import { parseDoc } from './parse'

const L = { facts: '2 days · 4 stops', budget: 'Budget', item: 'Item', cost: 'Cost', tips: 'Tips', total: 'Total' }
const plan = {
  type: 'trip', title: 'Quy Nhon 2 days', budget_total: '8,000,000', cost_breakdown: { Stay: '1,400,000', Food: '1 | 2' },
  days: [{ label: 'Day 1 - the beach', items: [{ time: '09:00', emoji: 'x', category: 'food', name: 'Pho Ba', description: 'Try the broth.', price: '50,000', address: '1 Road' }] }, { label: 'Day 2', items: [{ time: 'Morning', emoji: 'x', category: 'sightseeing', name: 'Ky Co' }] }],
  local_tips: [{ text: 'Book the boat a day ahead.', basis: 'general' }],
} as never

describe('planMarkdown', () => {
  it('writes the title, a section per day, the budget table and the tips, only from the plan', () => {
    const m = planMarkdown(plan, L)
    expect(m).toContain('# Quy Nhon 2 days')
    expect(m).toContain('## Day 1 - the beach')
    expect(m).toContain('- **09:00 - Pho Ba** - Try the broth. 50,000 1 Road')
    expect(m).toContain('| Stay | 1,400,000 |')
    expect(m).toContain('| Food | 1 / 2 |') // a pipe inside a cell cannot break the table
    expect(m).toContain('| Total | 8,000,000 |')
    expect(m).toContain('## Tips')
    expect(m).toContain('- Book the boat a day ahead.')
  })
  it('a plan without budget or tips has neither section', () => {
    const m = planMarkdown({ ...(plan as object), budget_total: undefined, cost_breakdown: undefined, local_tips: undefined } as never, L)
    expect(m).not.toContain('## Budget')
    expect(m).not.toContain('## Tips')
  })
  it('the report parser reads every day as its own section', () => {
    const blocks = parseDoc(planMarkdown(plan, L))
    expect(JSON.stringify(blocks)).toContain('Day 1 - the beach')
    expect(blocks.filter(b => b.t === 'heading').length).toBeGreaterThanOrEqual(3)
  })
})
