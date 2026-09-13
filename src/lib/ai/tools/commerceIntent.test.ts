import { describe, it, expect } from 'vitest'
import { foodCapabilityOf, entertainmentCapabilityOf, parseReservationSpec } from './commerceIntent'

// ── Owner correction (13 Sep 2026): the words decide the capability ─────────

const NOW = new Date('2026-09-13T08:00:00Z') // 15:00 in Asia/Ho_Chi_Minh → today = 2026-09-13

describe('foodCapabilityOf — delivery, reservation and discovery never collapse into one another', () => {
  it('delivery phrases → food_delivery', () => {
    for (const s of [
      'Tôi muốn đặt món ăn giao tận nhà.',
      'Đặt 2 phần phở giao đến nhà',
      'ship cho tôi 1 bánh mì',
      'order some pho delivered to my place',
      'giao hàng tới văn phòng',
      'gọi món về nhà',
    ]) expect(foodCapabilityOf(s), s).toBe('food_delivery')
  })

  it('reservation phrases → table_reservation, even when "đặt" also appears', () => {
    for (const s of [
      'Tôi muốn đặt bàn cho 2 người lúc 19h.',
      'Đặt bàn nhà hàng Nhật cho 2 người lúc 19h',
      'giữ chỗ 4 người tối nay',
      'book a table for two at 7pm',
      'dat ban cho 2 nguoi luc 19h',
    ]) expect(foodCapabilityOf(s), s).toBe('table_reservation')
  })

  it('discovery phrases → restaurant_discovery', () => {
    for (const s of ['Tìm nhà hàng Nhật gần tôi', 'quán phở ngon quận 1', 'xem menu nhà hàng này', '', undefined]) {
      expect(foodCapabilityOf(s), String(s)).toBe('restaurant_discovery')
    }
  })

  it('does not match inside other words (Unicode-aware edges)', () => {
    expect(foodCapabilityOf('nhà hàng hải sản đặc biệt')).toBe('restaurant_discovery')
    expect(foodCapabilityOf('quán ăn ở khu vực giao lộ')).toBe('restaurant_discovery')
  })
})

describe('entertainmentCapabilityOf', () => {
  it('film / cinema words → cinema_ticket; attractions → activity_booking', () => {
    expect(entertainmentCapabilityOf('Tìm vé xem phim CGV tối nay.')).toBe('cinema_ticket')
    expect(entertainmentCapabilityOf('rạp nào gần đây')).toBe('cinema_ticket')
    expect(entertainmentCapabilityOf('Tìm hoạt động ở VinWonders')).toBe('activity_booking')
    expect(entertainmentCapabilityOf(undefined)).toBe('activity_booking')
  })
})

describe('parseReservationSpec — values from the sentence only', () => {
  it('"cho 2 người lúc 19h" → 2 adults, 19:00, NO date (never assumed — Phase 8 P1-3)', () => {
    expect(parseReservationSpec('Tôi muốn đặt bàn cho 2 người lúc 19h.', NOW)).toEqual({ adults: 2, time: '19:00', date: null, assumed: ['date'] })
  })
  it('understands 19:30, 7h tối, 7pm, 12h trưa, and explicit / relative dates', () => {
    expect(parseReservationSpec('4 người 19:30 tối nay', NOW)).toEqual({ adults: 4, time: '19:30', date: '2026-09-13', assumed: [] })
    expect(parseReservationSpec('bàn cho 3 người 7h tối ngày mai', NOW)).toEqual({ adults: 3, time: '19:00', date: '2026-09-14', assumed: [] })
    expect(parseReservationSpec('table for 2 at 7pm on 20/09/2026', NOW)).toEqual({ adults: 2, time: '19:00', date: '2026-09-20', assumed: [] })
    expect(parseReservationSpec('2 khách 12h trưa 20/9', NOW)).toEqual({ adults: 2, time: '12:00', date: '2026-09-20', assumed: [] })
  })
  it('refuses to guess: no party, no time, ambiguous "7h", impossible values', () => {
    expect(parseReservationSpec('đặt bàn lúc 19h', NOW)).toBeNull()
    expect(parseReservationSpec('đặt bàn cho 2 người', NOW)).toBeNull()
    expect(parseReservationSpec('đặt bàn cho 2 người lúc 7h', NOW)).toBeNull()
    expect(parseReservationSpec('cho 2 người lúc 25h', NOW)).toBeNull()
    expect(parseReservationSpec('cho 40 người lúc 19h', NOW)).toBeNull()
    expect(parseReservationSpec('cho 2 người lúc 19h ngày 31/2', NOW)).toBeNull()
  })
})
