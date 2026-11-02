// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { suppressUngroundedVenues } from './groundingGate'

const PLAN = [
  'Lịch gợi ý cho chuyến đi:',
  '',
  '**Ngày 1 – Đến đảo, biển và nghỉ ngơi**',
  'Đến nơi nhận phòng, chiều tắm biển, tối ăn hải sản.',
  '',
  '**Ngày 2 – Khám phá biển**',
  'Sáng thuê xe đi vòng đảo, chiều nghỉ ngơi ngắm hoàng hôn.',
  '',
  '**Quán Hải Sản Giả Tưởng**',
  'Quán này nổi tiếng với món cua rang me rất ngon, nằm gần cảng.',
].join('\n')
const known = ['Nhà hàng Biển Xanh']
const base = { placeSearch: 'has_results' as const }

describe('plan day headings are not venues (flag on); an invented venue is still cut', () => {
  it('flag on: day headings stay, the invented venue sentence is still removed', () => {
    const r = suppressUngroundedVenues(PLAN, known, 'vi', { ...base, dayHeadings: true })
    expect(r.text).toContain('**Ngày 1 – Đến đảo, biển và nghỉ ngơi**')
    expect(r.text).toContain('**Ngày 2 – Khám phá biển**')
    expect(r.suppressed.join(' ')).not.toMatch(/Ngày/)
    expect(r.suppressed.join(' ')).toMatch(/Quán Hải Sản Giả Tưởng/)
    expect(r.text).not.toContain('Quán Hải Sản Giả Tưởng')
  })
  it('CONTROL — flag off: the gate is exactly as before', () => {
    const on = suppressUngroundedVenues(PLAN, known, 'vi', { ...base, dayHeadings: true })
    const off = suppressUngroundedVenues(PLAN, known, 'vi', base)
    const none = suppressUngroundedVenues(PLAN, known, 'vi', { ...base, dayHeadings: false })
    expect(none).toEqual(off)
    expect(off.suppressed.length).toBeGreaterThanOrEqual(on.suppressed.length)
    expect(off.suppressed.join(' ')).toMatch(/Ngày 2/) // the defect the option removes
  })
})
