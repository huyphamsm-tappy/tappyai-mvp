import { describe, it, expect } from 'vitest'
import { appendPlanBudgetMath } from './planBudgetMath'

const plan = (p: Record<string, unknown>) => `Kế hoạch đây.\n\n[TAPPY_PLAN]\n${JSON.stringify(p)}\n[/TAPPY_PLAN]\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]`
const trip3 = { type: 'trip', people: 2, days: [{}, {}, {}] }

describe('appendPlanBudgetMath — principle 7: spending shows the arithmetic', () => {
  it('c40 T1 "3 ngày 2 đêm cho 2 người, ngân sách 6 triệu" → per person and per person-day', () => {
    const r = appendPlanBudgetMath(plan(trip3), ['Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 6 triệu'])
    expect(r.added).toBe(true)
    expect(r.text).toContain('💰 Ngân sách: 6.000.000đ ÷ 2 người = 3.000.000đ/người · ÷ 3 ngày = 1.000.000đ/người/ngày')
    // right after the plan block, before the marker blocks
    expect(r.text.indexOf('💰')).toBeGreaterThan(r.text.indexOf('[/TAPPY_PLAN]'))
    expect(r.text.indexOf('💰')).toBeLessThan(r.text.indexOf('[FOLLOWUPS]'))
  })

  it('an evening plan with a stated budget splits per person only', () => {
    const r = appendPlanBudgetMath(plan({ type: 'evening', people: 5, days: [{}] }), ['tối nay đi chơi 5 người, ngân sách 2 triệu'])
    expect(r.text).toContain('2.000.000đ ÷ 5 người = 400.000đ/người')
    expect(r.text).not.toContain('/ngày')
  })

  it('no stated budget → nothing is added (never estimated)', () => {
    expect(appendPlanBudgetMath(plan(trip3), ['đi Đà Nẵng 3 ngày 2 đêm']).added).toBe(false)
  })

  it('no plan block / broken block → unchanged', () => {
    expect(appendPlanBudgetMath('không có kế hoạch', ['ngân sách 5 triệu']).added).toBe(false)
    expect(appendPlanBudgetMath('[TAPPY_PLAN]\n{"type":\n[/TAPPY_PLAN]', ['ngân sách 5 triệu']).added).toBe(false)
  })

  it('English', () => {
    expect(appendPlanBudgetMath(plan(trip3), ['Da Nang 3 days for 2 people, budget 6 million'], 'en').text).toContain('/person/day')
  })
})
