import { describe, it, expect } from 'vitest'
import { nearbyDestination, travelPreCall, withoutShownRows } from './consultTravel'

describe('a weekend trip that names a terrain, not a place (replay TRAVEL-2, 29/09)', () => {
  const known = { xuat_phat: 'TP.HCM', so_ngay: '2 ngày 1 đêm', so_nguoi: 'gia đình', phong_cach: 'núi', phuong_tien: 'xe riêng' }
  it('proposes a destination by the city the user leaves from — never "Núi gần TP.HCM"', () => {
    expect(nearbyDestination(known)).toBe('Tây Ninh')
    expect(travelPreCall(known, 'đi 2 ngày 1 đêm, gia đình 4 người, xe riêng, 5 triệu, thích núi')).toMatchObject({ name: 'get_hotel_prices', args: { location: 'Tây Ninh' } })
    expect(nearbyDestination({ ...known, phong_cach: 'biển' })).toBe('Vũng Tàu')
  })
  it('a named destination, a long trip or an unknown origin is left alone', () => {
    expect(travelPreCall({ ...known, diem_den: 'Đà Lạt' }, 'đi Đà Lạt')).toMatchObject({ args: { location: 'Đà Lạt' } })
    expect(nearbyDestination({ ...known, so_ngay: '5 ngày' })).toBeNull()
    expect(nearbyDestination({ ...known, xuat_phat: 'Cần Thơ' })).toBeNull()
  })
})

describe('withoutShownRows — a "bác" never gets back only what was already shown (level B)', () => {
  const result = { hotels: [{ name: 'Khách Sạn Song Nhật' }, { name: 'Khách Sạn Núi Thành' }] }
  it('keeps the rows (as before) unless the caller allows an empty list', () => {
    expect(withoutShownRows(result, ['Khách Sạn Song Nhật', 'Khách Sạn Núi Thành'])).toMatchObject({ hotels: result.hotels })
    const r = withoutShownRows(result, ['Khách Sạn Song Nhật', 'Khách Sạn Núi Thành'], { allowEmpty: true }) as Record<string, unknown>
    expect(r.hotels).toEqual([])
    expect(String(r._tappy_all_shown)).toMatch(/KHONG chon lai/)
  })
  it('unshown rows are kept either way', () => {
    expect(withoutShownRows(result, ['Khách Sạn Song Nhật'], { allowEmpty: true })).toMatchObject({ hotels: [{ name: 'Khách Sạn Núi Thành' }] })
  })
})
