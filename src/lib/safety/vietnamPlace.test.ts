import { describe, it, expect } from 'vitest'
import { insideVietnam } from './vietnamPlace'

describe('insideVietnam (a device position, conservative: a doubtful point is NOT Vietnam)', () => {
  it.each([
    ['Hà Nội', 21.03, 105.85], ['Hải Phòng', 20.86, 106.68], ['Hạ Long', 20.95, 107.08], ['Vinh', 18.67, 105.68], ['Huế', 16.46, 107.6], ['Đà Nẵng', 16.05, 108.2],
    ['Nha Trang', 12.24, 109.2], ['Đà Lạt', 11.94, 108.44], ['Buôn Ma Thuột', 12.67, 108.04], ['TP.HCM', 10.8, 106.7], ['Cần Thơ', 10.03, 105.78], ['Vũng Tàu', 10.35, 107.08],
  ])('%s is inside', (_n, lat, lng) => { expect(insideVietnam(lat, lng)).toBe(true) })
  it.each([
    ['Vientiane', 17.97, 102.6], ['Phnom Penh', 11.56, 104.92], ['Bangkok', 13.75, 100.5], ['Kunming', 25.04, 102.71], ['Nanning', 22.82, 108.37], ['Savannakhet', 16.55, 104.75],
    ['Sihanoukville', 10.63, 103.5], ['Manila', 14.6, 120.98], ['Singapore', 1.35, 103.82], ['London', 51.5, -0.12], ['Null island', 0, 0],
  ])('%s is outside', (_n, lat, lng) => { expect(insideVietnam(lat, lng)).toBe(false) })
  it('rejects non-finite and out-of-range values', () => {
    expect(insideVietnam(NaN, 105)).toBe(false)
    expect(insideVietnam(21, Infinity)).toBe(false)
    expect(insideVietnam(91, 105)).toBe(false)
  })
})
