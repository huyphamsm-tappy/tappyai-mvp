import { describe, it, expect } from 'vitest'
import { applyPlaceConstraints, detectPlaceConstraints } from './placeConstraintFilter'

// PRELAUNCH 5b: a district the user STATES constrains the ROWS (cards + ranked set), by address.

const IN_Q3 = { name: 'Phở Hòa Pasteur', address: '260C Pasteur, Xuân Hòa, Hồ Chí Minh, Việt Nam', rating: 4.5 }
const IN_Q3_B = { name: 'Phở Lệ Bàn Cờ', address: '413 Nguyễn Trãi, Bàn Cờ, Hồ Chí Minh, Việt Nam', rating: 4.3 }
const OUT_Q1 = { name: 'Phở Việt Nam', address: '112 Lý Tự Trọng, Bến Thành, Hồ Chí Minh 700000, Việt Nam', rating: 4.8 }
const OUT_Q1_B = { name: 'Phở Cali', address: '160 Pasteur, Quận 1, Hồ Chí Minh, Việt Nam', rating: 4.6 }
const UNKNOWN = { name: 'Phở Không Rõ', address: '9 Đường Mới, Phường Lạ, Hồ Chí Minh, Việt Nam', rating: 4.0 }
const now = new Date('2026-09-24T03:00:00Z') // 10:00 VN — no open-now side effects

describe('detectPlaceConstraints reads the stated district', () => {
  it('from this turn', () => expect(detectPlaceConstraints('Quán phở ngon ở Quận 3', null, [], now).district?.label).toBe('Quận 3'))
  it('from an earlier turn of the same subject when this one names none', () => {
    expect(detectPlaceConstraints('còn quán nào rẻ hơn không', null, ['Quán phở ngon ở Quận 3'], now).district?.label).toBe('Quận 3')
  })
  it('none when nobody named one', () => expect(detectPlaceConstraints('quán phở ngon gần đây', null, [], now).district).toBeNull())
})

describe('applyPlaceConstraints with a stated district', () => {
  const c = detectPlaceConstraints('Quán phở ngon ở Quận 3', null, [], now)

  it('keeps in-district rows first, drops rows the address puts in another district, keeps unknown after', () => {
    const r = applyPlaceConstraints({ results: [OUT_Q1, IN_Q3, UNKNOWN, OUT_Q1_B, IN_Q3_B] }, c, 'vi')
    const rows = (r.result as { results: Array<Record<string, unknown>> }).results
    expect(rows.map(x => x.name)).toEqual(['Phở Hòa Pasteur', 'Phở Lệ Bàn Cờ', 'Phở Không Rõ'])
    expect(rows[0]._tappy_district).toBe('Quận 3')
    expect(rows[2]._tappy_district_unconfirmed).toBe(true)
    expect(r.dropped.filter(d => d.reason === 'out_of_district').map(d => d.name)).toEqual(['Phở Việt Nam', 'Phở Cali'])
    expect(r.note).toMatch(/Quận 3/)
  })

  it('nothing in the district → says so, keeps the nearest alternatives MARKED with their real district', () => {
    const r = applyPlaceConstraints({ results: [OUT_Q1, OUT_Q1_B, UNKNOWN] }, c, 'vi')
    const rows = (r.result as { results: Array<Record<string, unknown>> }).results
    expect(rows.map(x => x.name)).toEqual(['Phở Không Rõ', 'Phở Việt Nam', 'Phở Cali'])
    expect(rows[1]._tappy_out_of_district).toBe('Quận 1')
    expect(r.note).toMatch(/KHÔNG có chỗ nào/)
    expect(r.note).toMatch(/NGOÀI Quận 3/)
  })

  it('English note', () => {
    const r = applyPlaceConstraints({ results: [OUT_Q1, IN_Q3] }, c, 'en')
    expect(r.note).toMatch(/Quận 3/)
    expect(r.note).toMatch(/outside/i)
  })

  it('no stated district → rows untouched (no-op)', () => {
    const none = detectPlaceConstraints('quán phở ngon gần đây', null, [], now)
    const input = { results: [OUT_Q1, IN_Q3] }
    expect(applyPlaceConstraints(input, none, 'vi').result).toBe(input)
  })
})
