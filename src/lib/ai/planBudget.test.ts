// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeBudget, lineTotal, appendPlanBudget, renderBudget, type BudgetLine, type BudgetContext } from './planBudget'
import { agentSystemV2For } from './agent/runtime/consultativeVoice'

const ctx: BudgetContext = { people: 2, days: 3, today: { day: 11, month: 10 } }
// amounts the turn's sources stated
const pool = [1_200_000, 900_000, 450_000, 150_000]

describe('lineTotal: each unit is multiplied by ITS own count (no mixed scopes)', () => {
  it('per person × people', () => expect(lineTotal({ per: 'person', unit_amount: 150_000 }, ctx)).toMatchObject({ lo: 300_000, hi: 300_000 }))
  it('a room price is per room per night: 1 room × 2 nights for 2 people, NOT × people', () => {
    const t = lineTotal({ per: 'room_night', unit_amount: 1_200_000 }, ctx)!
    expect(t.lo).toBe(2_400_000)
    expect(t.how).toContain('1 phòng × 2 đêm')
  })
  it('a one-way fare per person counts once per leg: 450k one way ≠ the return trip', () => {
    expect(lineTotal({ per: 'person_leg', unit_amount: 450_000, legs: 1 }, ctx)!.lo).toBe(900_000)
    expect(lineTotal({ per: 'person_leg', unit_amount: 450_000, legs: 2 }, ctx)!.lo).toBe(1_800_000)
  })
  it('a fare with no leg count cannot be summed', () => expect(lineTotal({ per: 'person_leg', unit_amount: 450_000 }, ctx)).toBeNull())
  it('an unknown unit is refused', () => expect(lineTotal({ per: 'trip', unit_amount: 1 }, ctx)).toBeNull())
  it('a range stays a range', () => {
    const t = lineTotal({ per: 'person_day', unit_amount: [150_000, 300_000] }, ctx)!
    expect([t.lo, t.hi]).toEqual([900_000, 1_800_000])
  })
})

describe('computeBudget: labels, evidence, total', () => {
  const lines: BudgetLine[] = [
    { item: 'Chỗ ở', per: 'room_night', unit_amount: 1_200_000, label: 'checked', basis: 'Booking.com' },
    { item: 'Vé xe khứ hồi', per: 'person_leg', unit_amount: 450_000, legs: 2, label: 'estimate', basis: 'Vexere' },
    { item: 'Ăn uống', per: 'person_day', unit_amount: 777_777, label: 'estimate' },          // not in the evidence
    { item: 'Vé tham quan', label: 'none' },
  ]
  const r = computeBudget(lines, pool, ctx)
  it('a unit price no source stated is dropped, the line says "chưa có dữ liệu"', () => {
    expect(r.rows[2]).toMatchObject({ label: 'none', lo: null })
    expect(r.rows[3]).toMatchObject({ label: 'none', lo: null })
  })
  it('the total adds ONLY the sourced lines, for 2 people and the whole trip', () => {
    expect(r.lo).toBe(2_400_000 + 1_800_000)
    expect(r.counted).toBe(2)
    expect(r.left).toEqual(['Ăn uống', 'Vé tham quan'])
  })
  it('the "đã tra" line carries the date, the estimate says it is not a booking price', () => {
    expect(r.rows[0].how).toContain('tra 11/10')
    expect(r.rows[1].how).toContain('không phải giá đặt chỗ')
  })
  it('rendered: one label per line, the total says what it leaves out', () => {
    const t = renderBudget(r, ctx)
    expect(t).toContain('[đã tra]')
    expect(t).toContain('[ước tính có nguồn]')
    expect(t).toContain('- Ăn uống: chưa có dữ liệu\n')
    expect(t).not.toContain('chưa có dữ liệu [')
    expect(t).toContain('chưa gồm các khoản chưa có dữ liệu: Ăn uống, Vé tham quan')
    expect(t).toContain('2 người')
  })
  it('a claimed label without a unit is "none", never counted', () => {
    expect(computeBudget([{ item: 'x', per: 'person', unit_amount: 150_000, label: 'maybe' }], pool, ctx).counted).toBe(0)
  })
})

describe('appendPlanBudget', () => {
  const plan = { type: 'trip', people: 2, days: [{ label: 'Ngày 1', items: [] }, { label: 'Ngày 2', items: [] }, { label: 'Ngày 3', items: [] }], budget_lines: [{ item: 'Chỗ ở', per: 'room_night', unit_amount: 900_000, label: 'checked', basis: 'Agoda' }] }
  const text = `Mở đầu.\n\n[TAPPY_PLAN]${JSON.stringify(plan)}[/TAPPY_PLAN]\n\nKết.`
  it('puts the computed budget after the block and removes budget_lines from the JSON', () => {
    const r = appendPlanBudget(text, pool, { day: 11, month: 10 })
    expect(r.added).toBe(true)
    const body = r.text.slice(r.text.indexOf('[TAPPY_PLAN]') + 12, r.text.indexOf('[/TAPPY_PLAN]'))
    expect(JSON.parse(body).budget_lines).toBeUndefined()
    expect(r.text.indexOf('💰 Ngân sách')).toBeGreaterThan(r.text.indexOf('[/TAPPY_PLAN]'))
    expect(r.text).toContain('1.800.000đ')
    expect(r.text.endsWith('Kết.')).toBe(true)
  })
  it('no lines: unchanged', () => {
    const t = `[TAPPY_PLAN]${JSON.stringify({ type: 'trip', days: [] })}[/TAPPY_PLAN]`
    expect(appendPlanBudget(t, pool, { day: 1, month: 1 })).toEqual({ text: t, added: false })
  })
})

describe('prompt', () => {
  it('flag on asks for budget_lines; flag off prompt does not know them', () => {
    expect(agentSystemV2For(true)).toContain('"budget_lines"')
    expect(agentSystemV2For(false)).not.toContain('budget_lines')
  })
})
