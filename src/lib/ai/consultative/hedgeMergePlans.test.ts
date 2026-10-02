import { describe, it, expect } from 'vitest'
import { capHedges } from './hedgeCap'

// Luna report 30/09 §7 (b): the code-merged "not confirmed" sentence was garbled in plan turns — replay 29/09 (Haiku,
// Phase 7): R15-1 t3 "Mình chưa xác nhận được từ nguồn đã tìm và giá", R9 t3 "…từ nguồn đã tìm, giá trực tuyến và giá",
// R15-5 t3 "…từ nguồn đã tìm, giá | và giá |". The inputs below are the guards' own sentences (travelGuard / hoursGuard)
// and the model hedges those plans carried.
const TRAVEL = 'Giờ chạy và giá vé cụ thể mình chưa xác nhận được từ nguồn đã tìm — bạn xem trên trang đặt vé.'
const HOURS = 'Giờ mở cửa mình chưa xác nhận được từ nguồn đã tìm — bạn kiểm tra trên Maps trước khi đi.'
const merge = (t: string) => capHedges(t, { lang: 'vi', max: 2 }).text

describe('merged hedge sentence in plan turns (Luna §7 b)', () => {
  it('a guard sentence keeps its REAL subject (the words before "mình chưa xác nhận được"), never "từ nguồn đã tìm"', () => {
    const out = merge(`**Mình chọn: Xe Phương Trang.** Đi sáng thứ Bảy. ${TRAVEL} Mình chưa xác nhận được giá. Chưa có thông tin về giá trực tuyến.`)
    expect(out).not.toMatch(/từ nguồn đã tìm(?:,| và)/)
    expect(out).toContain('giờ chạy và giá vé cụ thể')
    expect(out).not.toMatch(/\bgiá(?: trực tuyến)? và giá\b|giá, giá/)
  })
  it('the same subject twice (giá / mức giá / giá trực tuyến / giá vé) is said once', () => {
    const out = merge(`**Mình chọn: Quán A.** ${HOURS} Mình chưa xác nhận được mức giá. Chưa có thông tin về giá. Mình chưa xác nhận được phòng riêng.`)
    expect(out.match(/chưa xác nhận được/g)?.length).toBe(1)
    expect(out).toContain('giờ mở cửa')
    expect(out).toContain('phòng riêng')
    expect(out).not.toMatch(/giá và (?:mức )?giá|giá, (?:mức )?giá/)
  })
  it('a hedge inside a table row is never stitched into the merged sentence', () => {
    const t = `**Mình chọn: Khách sạn B.**\n\n| Mục | Chi phí |\n|---|---|\n| Phòng | chưa xác nhận được giá |\n| Ăn | chưa có giá |\n\n${TRAVEL} Mình chưa xác nhận được bãi đỗ xe.`
    const out = merge(t)
    expect(out).not.toMatch(/\| và|và giá \|/)
    expect(out).toContain('| Phòng | chưa xác nhận được giá |')
  })
})
