import { describe, it, expect } from 'vitest'
import { planAmount, projectPlanPrices } from './planPrice'
import { parsePlan } from '@/lib/structuredContent/parsePlan'
import { readPlanShareSnapshot, toPlanShareSnapshot } from '@/lib/plans/share/planShare'
import { planNoPriceSentinel } from '@/lib/ai/planPriceGuard'
import type { TappyPlan } from '@/components/TripPlanCard'

// "chưa có giá" was painted in the PRICE slot of the plan card and the public brochure (a gold
// price chip, an "Estimated budget" row). A data marker is never a value.

describe('planAmount — only an actual amount is a price', () => {
  it.each(['150.000đ', '~150.000đ/người', '200k', '1,2 triệu', '5.000.000 VND', '$25', 'Miễn phí', 'miễn phí vào cửa', 'Free', '0đ'])(
    'keeps %s', (v) => expect(planAmount(v)).toBe(v))

  it.each(['chưa có giá', 'Chưa có giá', 'price not available', planNoPriceSentinel('vi'), planNoPriceSentinel('en'),
    'chưa rõ giá', '$$', 'Liên hệ', 'tùy', 'N/A', 'unknown', '', '   ', 'chưa có giá (2 người)'])(
    'drops %j', (v) => expect(planAmount(v)).toBeUndefined())

  it('ignores non-strings', () => {
    expect(planAmount(undefined)).toBeUndefined()
    expect(planAmount(150000)).toBeUndefined()
    expect(planAmount(null)).toBeUndefined()
  })
})

// The real plan from the UAT brochure (/plan/cZAI86wdjVH7, 2026-09-24): 4 of 5 stops and the
// budget carried the sentinel.
const REAL: TappyPlan = {
  type: 'trip', title: 'Khám phá Đà Lạt - 1 ngày', people: 2, budget_total: 'chưa có giá',
  cost_breakdown: { 'Khách sạn': 'chưa có giá', 'Quảng trường': 'Miễn phí', 'Ăn tối': '250.000đ' },
  days: [{ label: 'Ngày 1', items: [
    { time: '08:00', name: 'MerPerle Dalat Hotel', price: 'chưa có giá' },
    { time: '12:00', name: 'Quảng trường Lâm Viên', price: 'Miễn phí' },
    { time: '17:30', name: 'Tiệm ăn Đà Lạt Phố', price: '120.000đ/người' },
  ] }],
} as unknown as TappyPlan

describe('projectPlanPrices — the plan card / Planner / share payload', () => {
  it('drops sentinel prices, the sentinel budget and sentinel breakdown lines; keeps amounts and "free"', () => {
    const p = projectPlanPrices(REAL)
    expect(p.budget_total).toBeUndefined()
    expect(p.cost_breakdown).toEqual({ 'Quảng trường': 'Miễn phí', 'Ăn tối': '250.000đ' })
    expect(p.days[0].items.map((i) => i.price)).toEqual([undefined, 'Miễn phí', '120.000đ/người'])
    expect('price' in p.days[0].items[0]).toBe(false) // absent, not an empty string
  })

  it('does not change the shape or anything that is not a price', () => {
    const p = projectPlanPrices(REAL)
    expect(p.title).toBe(REAL.title)
    expect(p.people).toBe(2)
    expect(p.days[0].items.map((i) => i.name)).toEqual(REAL.days[0].items.map((i) => i.name))
  })

  it('parsePlan applies it, so the chat card never receives the sentinel', () => {
    const { plan } = parsePlan(`Here you go\n[TAPPY_PLAN]${JSON.stringify(REAL)}[/TAPPY_PLAN]`)
    expect(plan?.budget_total).toBeUndefined()
    expect(JSON.stringify(plan)).not.toMatch(/chưa có giá/)
  })
})

describe('the public brochure snapshot', () => {
  it('a new share publishes no sentinel', () => {
    const snap = toPlanShareSnapshot(REAL)!
    expect(snap.budget_total).toBeUndefined()
    expect(snap.days[0].items.map((i) => i.price)).toEqual([undefined, 'Miễn phí', '120.000đ/người'])
  })

  it('a row stored BEFORE this rule renders without the sentinel too (read path re-projects)', () => {
    const storedRow = { v: 1, title: 'Old row', budget_total: 'chưa có giá', days: [{ label: 'Ngày 1', items: [{ name: 'A', price: 'chưa có giá' }, { name: 'B', price: '90.000đ' }] }] }
    const snap = readPlanShareSnapshot(storedRow)!
    expect(snap.budget_total).toBeUndefined()
    expect(snap.days[0].items.map((i) => i.price)).toEqual([undefined, '90.000đ'])
  })
})
