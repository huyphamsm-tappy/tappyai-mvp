import { describe, it, expect } from 'vitest'
import { planCostSubject } from '../streamEnrichment'
import { appendConsultPlanCost } from '../planBudgetMath'
import { hideEmptyPlanSections, missingStagesLine } from './domainFrames'
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
  it('E1-G5 re-run: an everyday word that folds into the old pick ("giả định" ≈ "Gia Đình") never beats the venue the plan writes in full', () => {
    const plan = 'Mình giả định: **5 người** · **tối nay (30/09)** — bạn đổi thì mình tính lại.\n\n## **Giờ đến & đặt bàn**\nĐặt bàn qua **0921 942 754** (A Xỉu - Quán Ăn Ngon).\n\n## **Chi phí**\n'
    const old = 'Nhà Hàng Quán Ăn Gia Đình Ngon - Quán Ăn Bắc Gần Sân Bay - Ngon rẻ Tphcm'
    expect(planCostSubject(plan, old, new Map(), [old, 'A Xỉu - Quán Ăn Ngon']).name).toBe('A Xỉu - Quán Ăn Ngon')
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

describe('(c) owner 30/09 — a plan section with no data is HIDDEN; a missing requested stage is said once at the end', () => {
  it('FOOD-2 / SPA-3: bare headings disappear with their heading; filled sections are untouched', () => {
    const plan = '**Giờ đến & đặt bàn**\n\n**Gọi món**\n- Bánh cuốn nóng (2–3 phần)\n\n**Đi lại & gửi xe**\n\n**Mẹo địa phương**\n- Ăn ngay khi vừa giao.\n\n[FOLLOWUPS]a|b[/FOLLOWUPS]'
    const r = hideEmptyPlanSections(plan)
    expect(r.hidden).toEqual(['Giờ đến & đặt bàn', 'Đi lại & gửi xe'])
    expect(r.text).not.toContain('Giờ đến & đặt bàn')
    expect(r.text).not.toContain('Đi lại & gửi xe')
    expect(r.text).toContain('**Gọi món**\n- Bánh cuốn nóng')
    expect(r.text).toContain('[FOLLOWUPS]a|b[/FOLLOWUPS]')
    const spa = '**Gói / dịch vụ nên chọn**\n**Đặt lịch**\n- Gọi 0909 000 000.\n**Thời lượng**\n[FOLLOWUPS]x[/FOLLOWUPS]'
    expect(hideEmptyPlanSections(spa).hidden).toEqual(['Gói / dịch vụ nên chọn', 'Thời lượng'])
  })
  it('SPA-1 (Luna 30/09, verbatim): "Thời lượng" holding only "Chưa có thông tin đã kiểm cho mục này." is hidden', () => {
    const plan = '**Chuẩn bị trước khi đến**\nBáo rõ bạn muốn massage toàn thân và kỹ thuật viên nữ.\n\n**Thời lượng**\n- Chưa có thông tin đã kiểm cho mục này.\n\n**Chi phí**\n- Gạo Spa - Massage Hochiminh: chưa có giá — hỏi quán.\n- Tổng: chưa tính được vì chưa có giá có nguồn.\n\n**Lưu ý**\n- Kỹ thuật viên nữ chưa được xác nhận trong dữ liệu.'
    const r = hideEmptyPlanSections(plan)
    expect(r.hidden).toEqual(['Thời lượng'])
    expect(r.text).not.toContain('Thời lượng')
    expect(r.text).not.toContain('Chưa có thông tin đã kiểm cho mục này')
    expect(r.text).toContain('**Chi phí**\n- Gạo Spa')
  })
  it('E1-G5 (Luna 30/09): "ăn tối rồi đi chơi rồi đi uống" with dinner + karaoke and no drinking place → one sentence', () => {
    const users = ['Tối nay đi chơi gì với hội bạn 5 người ở Quận 1', 'ăn tối rồi đi chơi rồi đi uống, sôi động, tầm 300k/người', 'Lên kế hoạch chi tiết']
    const plan = '**Giờ đến & đặt bàn**\nLONG WANG Hồ Con Rùa, 11 Phạm Ngọc Thạch. Đi khoảng 19:00 để ăn tối.\n\n**Đi lại & gửi xe**\nĐiểm karaoke được chọn: **Karaoke MEI**, 159 Hàm Nghi, Quận 1.'
    expect(missingStagesLine(plan, users)).toBe('Chặng đi uống bạn muốn chưa có trong kế hoạch vì mình chưa có địa điểm đã kiểm — bạn muốn mình tìm thêm không?')
    expect(missingStagesLine(plan + '\nSau đó qua **Chill Skybar** uống.', users)).toBeNull()
    expect(missingStagesLine('**Lịch buổi**\n- 19:00 ăn tối tại quán A.', users)).toMatch(/^Chặng đi uống và đi chơi bạn muốn/)
    expect(missingStagesLine(plan, ['massage toàn thân tối nay'])).toBeNull()
  })
  it('E1-G5 merged sentence: a subject that itself says "và" is not chained with another "và"', () => {
    const t = '**Mình chọn: LONG WANG.** Mình chưa xác nhận được thực đơn hoặc khẩu phần. Chưa có thông tin về chỗ gửi xe. Mình chưa xác nhận được địa điểm và giá. Chưa rõ địa điểm dự phòng.'
    const out = capHedges(t, { lang: 'vi', max: 2 }).text
    expect(out).not.toMatch(/\bvà giá và\b/)
  })
})
