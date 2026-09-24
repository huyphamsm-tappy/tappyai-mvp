import { describe, it, expect } from 'vitest'
import { guardDistrictClaims } from './districtClaimGuard'
import { statedDistrict } from './districts'

// PRELAUNCH 5b: a Quận 1 venue must never be presented as being in Quận 3.
const q3 = statedDistrict('Quận 3')
const places = [
  { name: 'Phở Hòa Pasteur', address: '260C Pasteur, Xuân Hòa, Hồ Chí Minh, Việt Nam' },   // Quận 3
  { name: 'Phở Việt Nam - Bến Thành', address: '112 Lý Tự Trọng, Bến Thành, Hồ Chí Minh 700000, Việt Nam' }, // Quận 1
  { name: 'Phở Không Rõ', address: '9 Đường Mới, Phường Lạ, Hồ Chí Minh, Việt Nam' },     // unknown
]

describe('guardDistrictClaims', () => {
  it('rewrites the requested district to the venue\'s real one in the sentence that names it', () => {
    const r = guardDistrictClaims('Phở Việt Nam ở Quận 3 là lựa chọn ngon. Phở Hòa Pasteur cũng ở Quận 3.', q3, places)
    expect(r.text).toBe('Phở Việt Nam ở Quận 1 là lựa chọn ngon. Phở Hòa Pasteur cũng ở Quận 3.')
    expect(r.rewritten).toBe(1)
  })

  it('catches the short forms Q3 / Q.3 / (Quận 3)', () => {
    expect(guardDistrictClaims('- **Phở Việt Nam** (Q3): nước dùng đậm', q3, places).text).toBe('- **Phở Việt Nam** (Quận 1): nước dùng đậm')
    expect(guardDistrictClaims('Phở Việt Nam, Q.3, mở tới khuya', q3, places).text).toContain('Quận 1')
  })

  it('leaves a sentence that already names the real district alone', () => {
    const s = 'Phở Việt Nam không ở Quận 3 mà ở Quận 1, cách khoảng 2 km.'
    expect(guardDistrictClaims(s, q3, places).text).toBe(s)
  })

  it('never touches an in-district or unconfirmed venue', () => {
    const s = 'Phở Hòa Pasteur ở Quận 3. Phở Không Rõ gần Quận 3.'
    expect(guardDistrictClaims(s, q3, places)).toMatchObject({ text: s, rewritten: 0 })
  })

  it('no requested district → no-op', () => {
    const s = 'Phở Việt Nam ở Quận 3.'
    expect(guardDistrictClaims(s, null, places).text).toBe(s)
  })

  it('named districts too', () => {
    const bt = statedDistrict('ở Bình Thạnh')
    const r = guardDistrictClaims('Cafe Bến Thành Corner ở Bình Thạnh rất yên tĩnh.', bt, [{ name: 'Cafe Bến Thành Corner', address: '1 Lê Lợi, Bến Thành, Hồ Chí Minh, Việt Nam' }])
    expect(r.text).toBe('Cafe Bến Thành Corner ở Quận 1 rất yên tĩnh.')
  })
})
