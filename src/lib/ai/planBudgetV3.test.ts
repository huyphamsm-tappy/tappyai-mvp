import { describe, it, expect } from 'vitest'
import { appendPlanBudget, computeBudget } from './planBudget'

// CONSULT_V3 (owner 17/10, decision B): a budget line no source states is shown as a labelled planning estimate instead of "chưa có dữ liệu".
// Đợt 2 (UAT đợt A, "chia đúng 30 triệu như ChatGPT"): the planned budget is a table, and with the user's own total it is an allocation of
// that total. Without the option the budget is unchanged.

const PLAN = (lines: unknown[]) => `Dẫn đầu.\n[TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Đà Nẵng', people: 2, days: [{ label: 'Ngày 1', items: [] }, { label: 'Ngày 2', items: [] }, { label: 'Ngày 3', items: [] }], budget_lines: lines })}[/TAPPY_PLAN]\nKết.`
const LINES = [
  { item: 'Vé máy bay khứ hồi', unit_amount: [1500000, 2500000], per: 'person_leg', legs: 2, label: 'estimate', basis: 'ước tính' },
  { item: 'Khách sạn 2 đêm', unit_amount: 3500000, per: 'room_night', label: 'estimate', basis: 'ước tính' },
  { item: 'Ăn uống', unit_amount: 600000, per: 'person_day', label: 'estimate', basis: 'ước tính' },
]
// an allocation of 30 triệu for 2 people, 3 days, single figures (the V3 prompt asks for these when the user states a total)
const ALLOC = [
  { item: 'Vé máy bay khứ hồi', unit_amount: 2000000, per: 'person_leg', legs: 2, label: 'estimate', basis: 'ước tính' },
  { item: 'Resort 2 đêm', unit_amount: 4000000, per: 'room_night', label: 'estimate', basis: 'ước tính' },
  { item: 'Ăn uống', unit_amount: 700000, per: 'person_day', label: 'estimate', basis: 'ước tính' },
]
const today = { day: 17, month: 10 }

describe('plan budget — CONSULT_V3 labelled estimates', () => {
  it('with allowEstimates: a table, every line keeps its figure labelled "ước tính", with a total and the not-a-booking-price note', () => {
    const out = appendPlanBudget(PLAN(LINES), [], today, 'vi', { allowEstimates: true }).text
    expect(out).toContain('💰 Ngân sách dự kiến cho 2 người, 3 ngày:')
    expect(out).toContain('| Khoản | Số tiền | Ghi chú |')
    expect(out).toContain('| Vé máy bay khứ hồi | 6.000.000đ–10.000.000đ | ước tính |')
    expect(out).toContain('| Khách sạn 2 đêm | 7.000.000đ | ước tính |')
    expect(out).toContain('| Ăn uống | 3.600.000đ | ước tính |')
    expect(out).toContain('| Tổng | 16.600.000đ–20.600.000đ |')
    expect(out).toContain('chưa phải giá đặt chỗ')
    expect(out).not.toContain('chưa có dữ liệu')
    expect(out).not.toContain('budget_lines')
  })

  it('with the user\'s total: the remainder is a "Dự phòng / nâng cấp" row and the table adds up to exactly that total', () => {
    const out = appendPlanBudget(PLAN(ALLOC), [], today, 'vi', { allowEstimates: true, userTotal: 30_000_000 }).text
    // 8.000.000 + 8.000.000 + 4.200.000 = 20.200.000 → 9.800.000 left
    expect(out).toContain('💰 Phân bổ ngân sách 30.000.000đ cho 2 người, 3 ngày:')
    expect(out).toContain('| Dự phòng / nâng cấp | 9.800.000đ | phần còn lại |')
    expect(out).toContain('| Tổng | 30.000.000đ |')
  })

  it('with the user\'s total exceeded: no remainder row, one sentence says by how much', () => {
    const out = appendPlanBudget(PLAN(ALLOC), [], today, 'vi', { allowEstimates: true, userTotal: 15_000_000 }).text
    expect(out).not.toContain('Dự phòng / nâng cấp')
    expect(out).toContain('vượt ngân sách 15.000.000đ khoảng 5.200.000đ')
    expect(out).toContain('| Tổng | 20.200.000đ |')
  })

  it('a line the model labelled "estimate" whose number happens to be in the evidence is still shown as "ước tính" (no unshown "có nguồn")', () => {
    const out = appendPlanBudget(PLAN([ALLOC[0]]), [2000000], today, 'vi', { allowEstimates: true }).text
    expect(out).toContain('| Vé máy bay khứ hồi | 8.000.000đ | ước tính |')
    expect(out).not.toContain('ước tính có nguồn')
  })

  it('without the option (unchanged): an amount no source states is "chưa có dữ liệu" and nothing is totalled', () => {
    const out = appendPlanBudget(PLAN(LINES), [], today, 'vi').text
    expect(out).toContain('Vé máy bay khứ hồi: chưa có dữ liệu')
    expect(out).toContain('Tổng: chưa tính được vì chưa khoản nào có nguồn.')
    expect(out).not.toContain('[ước tính]')
    expect(out).not.toContain('| Khoản |')
  })

  it('a sourced amount keeps its sourced label even with allowEstimates (an estimate never overrides a source)', () => {
    const res = computeBudget([{ item: 'Vé', unit_amount: 1200000, per: 'person_leg', legs: 1, label: 'checked', basis: 'VietJet' }], [1200000], { people: 2, days: 3, today }, { allowEstimates: true })
    expect(res.rows[0]).toMatchObject({ label: 'checked', lo: 2400000, hi: 2400000 })
    expect(res.rows[0].planned).toBeUndefined()
  })

  it('a line with no usable amount stays without a figure (no number is invented)', () => {
    const res = computeBudget([{ item: 'Vé Bà Nà', per: 'person', label: 'estimate' }], [], { people: 2, days: 3, today }, { allowEstimates: true })
    expect(res.rows[0]).toMatchObject({ lo: null, hi: null })
  })
})
