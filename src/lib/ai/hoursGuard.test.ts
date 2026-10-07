import { describe, it, expect } from 'vitest'
import { guardHoursClaimsInText } from './hoursGuard'
import { scheduleTimesIn } from './travelGuard'

// E1 (2026-09-20): opening hours are a NUMBER — they trace to a fetched row or they go.
// Measured live (Phase D runs 24/28): "mở đến 3h sáng", "mở cửa 08:30–18:00" were ungated.
const NL = String.fromCharCode(10)
const ROW_MEI = 'Karaoke MEI · Thứ Bảy: 10:00–03:00'
const ROW_DAMSEN = 'Công Viên Nước Đầm Sen · 08:30–18:00'

describe('clock-time reading (shared with the travel guard)', () => {
  it('reads Vietnamese minute and period forms', () => {
    expect(scheduleTimesIn('mở 10h30 đến 5h chiều')).toEqual(['10:30', '17:00'])
    expect(scheduleTimesIn('8 giờ rưỡi sáng tới 9 giờ đêm')).toEqual(['8:30', '21:00'])
    expect(scheduleTimesIn('08:30–18:00')).toEqual(['8:30', '18:00'])
    expect(scheduleTimesIn('nhóm 8 người tối nay')).toEqual([])
  })
})

describe('E1 — hours the rows state stay; hours they do not are cut by the clause', () => {
  it('keeps a row-backed "mở đến 3h sáng" and a row-backed "mở cửa 08:30–18:00"', () => {
    const a = 'Quán có 4.9⭐ từ 1.401 đánh giá, mở đến 3h sáng, mức giá 100-200k/người.'
    expect(guardHoursClaimsInText(a, [ROW_MEI]).text).toBe(a)
    const b = 'Đầm Sen — cách bạn 7km, mở cửa 08:30–18:00 hôm nay.'
    expect(guardHoursClaimsInText(b, [ROW_DAMSEN]).text).toBe(b)
  })

  it('cuts only the hour clause when the row says otherwise, keeps rating and price, hedges once', () => {
    const a = 'Quán có 4.9⭐ từ 1.401 đánh giá, mở đến 5h sáng, mức giá 100-200k/người.'
    const out = guardHoursClaimsInText(a, [ROW_MEI], { lang: 'vi' })
    expect(out.redacted).toBe(1)
    expect(out.unsupported).toEqual(['5:00'])
    expect(out.text).toContain('4.9⭐ từ 1.401 đánh giá')
    expect(out.text).toContain('100-200k/người')
    expect(out.text).not.toContain('5h sáng')
    expect(out.text.match(/Giờ mở cửa mình chưa xác nhận được/g)).toHaveLength(1)
  })

  it('with no evidence at all (a reply from memory) every stated hour is unsupported', () => {
    const out = guardHoursClaimsInText('Rạp thường mở từ 8h sáng đến 22h tối. Bạn muốn xem phim gì?', [], { lang: 'vi' })
    expect(out.text).not.toContain('22h')
    expect(out.text).toContain('Bạn muốn xem phim gì?')
  })

  it('a sentence that IS the hour claim goes whole, and a bare "mở cửa: 8h–22h" goes with its lead-in', () => {
    const out = guardHoursClaimsInText('Quán mở cửa 8h–22h.' + NL + 'Giờ mở cửa: 8h–22h.' + NL + 'Bạn nên đặt trước.', [], { lang: 'vi' })
    expect(out.text).not.toContain('8h')
    expect(out.text).toContain('Bạn nên đặt trước.')
    expect(out.text).not.toMatch(/Giờ mở cửa:\s*[.\n]/)
  })

  it('the full stop survives a cut of the final clause', () => {
    const out = guardHoursClaimsInText('Mình gợi ý **Đầm Sen** — cách bạn khoảng 7km, có 4.3⭐ từ 36.007 đánh giá Google Maps, mở cửa 08:30–18:00 hôm nay.', [], { lang: 'vi' })
    expect(out.text.startsWith('Mình gợi ý **Đầm Sen** — cách bạn khoảng 7km, có 4.3⭐ từ 36.007 đánh giá Google Maps.')).toBe(true)
    expect(out.text).not.toContain('08:30')
  })

  it('a time with no hours context (a departure, a showtime) is not this guard\'s business', () => {
    const a = 'Xe khởi hành 22:00.' + NL + 'Suất chiếu 19h30.'
    expect(guardHoursClaimsInText(a, []).text).toBe(a)
  })

  it('the hedge lands before the machine blocks', () => {
    const out = guardHoursClaimsInText('Quán mở đến 2h sáng.' + NL + NL + '[FOLLOWUPS]a|b[/FOLLOWUPS]', [], { lang: 'vi' })
    expect(out.text.indexOf('chưa xác nhận được')).toBeLessThan(out.text.indexOf('[FOLLOWUPS]'))
  })
})
