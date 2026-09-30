import { describe, it, expect } from 'vitest'
import { asksOtherDestination, nearbyDestination, nearbyTurnedDown, travelPreCall } from './consultTravel'

// Owner 30/09 night (B on the Luna review page, TRAVEL-2 t5–t7): after WE proposed Tây Ninh for "núi gần Sài Gòn",
// "còn chỗ nào khác" and "đi rồi, chỗ khác đi" were answered with other Tây Ninh HOTELS and the plan stayed in Tây Ninh.
// They ask for another DESTINATION. The user turns below are TRAVEL-2 verbatim.
const T = ['cuối tuần đi đâu chơi gần sài gòn', 'đi 2 ngày 1 đêm, gia đình 4 người, xe riêng, 5 triệu, thích núi', 'Núi Bà Đen, Tây Ninh đi mất mấy tiếng', 'Núi Bà Đen, Tây Ninh hay chỗ kia?', 'còn chỗ nào khác', 'đi rồi, chỗ khác đi', 'lên lịch trình chi tiết']
const known = { xuat_phat: 'TP.HCM', phong_cach: 'núi', so_ngay: '2', so_nguoi: '4', phuong_tien: 'xe riêng' }

describe('TRAVEL-2 — "chỗ khác" after a proposed destination changes the DESTINATION', () => {
  it('which turns ask for another destination (lodging words keep it a hotel change)', () => {
    expect(T.map(asksOtherDestination)).toEqual([false, false, false, false, true, true, false])
    expect(asksOtherDestination('xem thêm khách sạn khác')).toBe(false)
    expect(asksOtherDestination('homestay nào khác không')).toBe(false)
  })
  it('t2 Tây Ninh → t5 Bảo Lộc → t6 Xuân Lộc, and the plan (t7) stays on the last one', () => {
    expect(nearbyDestination(known, T.slice(0, 2))).toBe('Tây Ninh')
    expect(nearbyDestination(known, T.slice(0, 5))).toBe('Bảo Lộc')
    expect(nearbyTurnedDown(known, T.slice(0, 5))).toEqual(['Tây Ninh'])
    expect(nearbyDestination(known, T.slice(0, 6))).toBe('Xuân Lộc, Đồng Nai')
    expect(nearbyTurnedDown(known, T.slice(0, 6))).toEqual(['Tây Ninh', 'Bảo Lộc'])
    expect(nearbyDestination(known, T)).toBe('Xuân Lộc, Đồng Nai')
  })
  it('the hotel search of t5 / t6 runs at the NEW destination, never Tây Ninh', () => {
    expect(travelPreCall(known, T[4], new Date('2026-09-30T10:00:00Z'), T.slice(0, 5))).toMatchObject({ name: 'get_hotel_prices', args: { location: 'Bảo Lộc' } })
    expect(travelPreCall(known, T[5], new Date('2026-09-30T10:00:00Z'), T.slice(0, 6))).toMatchObject({ name: 'get_hotel_prices', args: { location: 'Xuân Lộc, Đồng Nai' } })
  })
  it('a destination the USER named is never replaced', () => {
    expect(travelPreCall({ ...known, diem_den: 'Đà Lạt' }, 'còn chỗ nào khác', new Date(), [...T.slice(0, 2), 'còn chỗ nào khác'])).toMatchObject({ args: { location: 'Đà Lạt' } })
  })
  it('the list running out gives no invented destination', () => {
    expect(nearbyDestination(known, ['chỗ khác', 'chỗ khác', 'chỗ khác'])).toBeNull()
  })
})
