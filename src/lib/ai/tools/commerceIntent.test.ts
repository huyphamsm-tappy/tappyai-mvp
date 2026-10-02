import { describe, it, expect } from 'vitest'
import { foodCapabilityOf, entertainmentCapabilityOf } from './commerceIntent'

// ── Owner correction (13 Sep 2026): the words decide the capability ─────────


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
