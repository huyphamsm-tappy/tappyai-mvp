import { describe, it, expect } from 'vitest'
import { appendConsultPlanCost, partyCount, perPersonBudget } from './planBudgetMath'

const plan = '**Giờ đến & đặt bàn**\nĐến 19:00.\n\n**Chi phí**\n\n**Đi lại & gửi xe**\nGửi xe lề đường.'

describe('appendConsultPlanCost', () => {
  it('writes people × the row band under the cost heading', () => {
    const out = appendConsultPlanCost(plan, { people: 2, band: { lo: 200_000, hi: 400_000 }, perHead: null }).text
    expect(out).toContain('**Chi phí**\n- 2 người × 200.000đ–400.000đ/người = 400.000đ–800.000đ')
    expect(out.indexOf('= 400.000đ')).toBeLessThan(out.indexOf('**Đi lại'))
  })
  it('falls back to the user budget, labelled as the user budget, never as the venue price', () => {
    const out = appendConsultPlanCost(plan, { people: 6, band: null, perHead: 200_000 }).text
    expect(out).toContain('Ngân sách bạn đưa: 6 người × 200.000đ = 1.200.000đ')
    expect(out).toContain('giá của quán chưa xác nhận')
  })
  it('adds nothing without people, without numbers, without a cost heading, or when arithmetic is there', () => {
    expect(appendConsultPlanCost(plan, { people: null, band: { lo: 1, hi: 2 }, perHead: null }).added).toBe(false)
    expect(appendConsultPlanCost(plan, { people: 2, band: null, perHead: null }).added).toBe(false)
    expect(appendConsultPlanCost('no headings', { people: 2, band: null, perHead: 100_000 }).added).toBe(false)
    expect(appendConsultPlanCost(plan.replace('**Chi phí**\n', '**Chi phí**\n2 × 100k = 200k\n'), { people: 2, band: null, perHead: 100_000 }).added).toBe(false)
  })
  it('parses party and per-person budget', () => {
    expect(partyCount('2 người')).toBe(2)
    expect(partyCount(undefined)).toBeNull()
    expect(perPersonBudget(['quán nhậu 6 người, tầm 200k/người'])).toBe(200_000)
    expect(perPersonBudget(['dưới 500k'])).toBeNull()
  })
})
