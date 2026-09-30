import { describe, it, expect } from 'vitest'
import { planCostSubject } from '../streamEnrichment'
import { appendConsultPlanCost } from '../planBudgetMath'
import { fillEmptyPlanSections } from './domainFrames'
import { capHedges } from './hedgeCap'
import { guardUnsupportedClaims } from '../unsupportedClaimGuard'
import { parsePriceBand } from '@/lib/recommendation/priceBand'

// Luna report 30/09 §7 — three CODE bugs in detailed-plan turns (Phase 7, both models), re-checked on rc 30/09 with the
// same scenarios (replay scenarios-2026-09-30T10-14 + E1-G5). The texts below are those plans, verbatim where it matters.

const band = (t: string) => parsePriceBand(t)!

describe('(a) the code-written "Chi phí" line is about the plan\'s own venue, with its sourced price', () => {
  it('ENT-3: a plan for BIBO KIDS is not priced as the thread\'s earlier pick "KHU VUI CHƠI TRẺ EM"', () => {
    const plan = '**Lịch buổi**\n- **10:30–12:30**: Chơi tại **BIBO KIDS** (6 Tăng Nhơn Phú, Phước Long) — gần Thủ Đức.\n- Mang nước uống, khu vui chơi thường ấm.\n\n**Chi phí**\n'
    const rows = ["CT'S HOUSE - KHU VUI CHƠI TRẺ EM THỦ ĐỨC", 'KHU VUI CHƠI TRẺ EM BIBO KIDS QUẬN 9 - THỦ ĐỨC']
    expect(planCostSubject(plan, 'KHU VUI CHƠI TRẺ EM', new Map(), rows).name).toBe('KHU VUI CHƠI TRẺ EM BIBO KIDS QUẬN 9 - THỦ ĐỨC')
  })
  it('E1-G5: a plan for A Xỉu is not priced as "Cơm Ngon Hà Nội"; its own band (1-100.000 ₫) is kept', () => {
    const plan = '## **Giờ đến & đặt bàn**\nĐến **17:30–18:00**. **A Xỉu - Quán Ăn Ngon** (26 Đề Thám) mở 17:00–22:30.\n\n## **Chi phí**\n'
    const bands = new Map([['A Xỉu - Quán Ăn Ngon', band('1-100.000 ₫')]])
    const s = planCostSubject(plan, 'Cơm Ngon Hà Nội', bands, ['A Xỉu - Quán Ăn Ngon'])
    expect(s.name).toBe('A Xỉu - Quán Ăn Ngon')
    const out = appendConsultPlanCost(plan, { people: 5, band: s.band, perHead: 300_000, pickName: s.name }).text
    expect(out).toContain('A Xỉu - Quán Ăn Ngon: 5 người × dưới 100.000đ/người = dưới 500.000đ (mức giá Google Maps)')
    expect(out).not.toContain('Cơm Ngon')
  })
  it('FOOD-2: "Bánh Cuốn Nóng Cao Bằng" (1-100.000 ₫) is priced, not "chưa có giá"', () => {
    const plan = '**Bánh Cuốn Nóng Cao Bằng** — 4.2⭐; giao được.\n\n**Chi phí**\n'
    const bands = new Map([['Bánh Cuốn Nóng Cao Bằng', band('1-100.000 ₫')]])
    const s = planCostSubject(plan, 'Bánh Cuốn Nóng Cao Bằng', bands)
    const out = appendConsultPlanCost(plan, { people: 1, band: s.band, perHead: 100_000, pickName: s.name }).text
    expect(out).toContain('Bánh Cuốn Nóng Cao Bằng: 1 người × dưới 100.000đ/người = dưới 100.000đ')
    expect(out).not.toMatch(/Bánh Cuốn Nóng Cao Bằng: chưa có giá/)
  })
  it('the settled pick still wins when the plan names it (ENT-1 Santori, 8 người)', () => {
    const plan = 'Mình giả định: **8 người, tối nay, quán Karaoke Santori**.\n\n**Chi phí**\n'
    const bands = new Map([['Karaoke MEI', band('100-600 N ₫')], ['Karaoke Santori', band('100-600 N ₫')]])
    expect(planCostSubject(plan, 'Karaoke Santori', bands, ['Karaoke MEI', 'Karaoke Santori']).name).toBe('Karaoke Santori')
  })
  it('a district the plan mentions never selects a venue by it', () => {
    const plan = '**Lịch buổi**\n- Đi chơi quanh Thủ Đức buổi sáng.\n\n**Chi phí**\n'
    expect(planCostSubject(plan, null, new Map(), ["CT'S HOUSE - KHU VUI CHƠI TRẺ EM THỦ ĐỨC"]).name).toBeNull()
  })
})

describe('(b) the code-built "not confirmed" sentences read as Vietnamese', () => {
  it('TRAVEL-2: a hedge in brackets is not a subject ("…giá vé cụ thể và (chưa có giá)")', () => {
    const t = '**Mình chọn: Meliá Vinpearl Tây Ninh.** Giờ chạy và giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang đặt vé. Mình chưa xác nhận được phòng gia đình. Xe khách về (chưa có giá).'
    const out = capHedges(t, { lang: 'vi', max: 2 }).text
    expect(out).not.toMatch(/và \(chưa có giá\)/)
  })
  it('FOOD-3: a purpose clause "để có phòng riêng" becomes its own honest sentence', () => {
    const r = guardUnsupportedClaims('Nên đến **19:00–19:30** để có phòng riêng, tránh giờ cao điểm.', { venues: [], sharedTexts: [], userTexts: ['6 người, cần phòng riêng'] })
    expect(r.text).not.toMatch(/để mình chưa xác nhận/)
    expect(r.text).toMatch(/tránh giờ cao điểm\. Mình chưa xác nhận được có phòng riêng\.$/)
  })
})

describe('(c) no empty section in a detailed plan', () => {
  it('FOOD-2 / SPA-3: a bare heading gets one honest line; filled sections are untouched', () => {
    const plan = '**Giờ đến & đặt bàn**\n\n**Gọi món**\n- Bánh cuốn nóng (2–3 phần)\n\n**Đi lại & gửi xe**\n\n**Mẹo địa phương**\n- Ăn ngay khi vừa giao.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]'
    const r = fillEmptyPlanSections(plan)
    expect(r.filled).toEqual(['Giờ đến & đặt bàn', 'Đi lại & gửi xe'])
    expect(r.text).toContain('**Giờ đến & đặt bàn**\n- Chưa có thông tin đã kiểm cho mục này.')
    expect(r.text).toContain('**Gọi món**\n- Bánh cuốn nóng')
    const spa = '**Gói / dịch vụ nên chọn**\n**Đặt lịch**\n- Gọi 0909 000 000.\n**Thời lượng**\n[FOLLOWUPS]x[/FOLLOWUPS]'
    expect(fillEmptyPlanSections(spa).filled).toEqual(['Gói / dịch vụ nên chọn', 'Thời lượng'])
  })
})
