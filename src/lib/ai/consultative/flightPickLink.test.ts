import { describe, it, expect } from 'vitest'
import { relativeDateIso, travelPreCall } from './consultTravel'

// R25 (Android e2e on UAT 1e96071, owner 30/09 + Q10): "vé máy bay đi Đà Nẵng" → ask card → "Cuối tuần này · Sáng · 1 người"
// got a HOTEL search (Sala Danang Beach Hotel) and "mình chưa có link Traveloka cho chặng và ngày này": the router state had
// no origin, so the fare call was skipped. The state below is the router decision logged by the offline replay, verbatim.
const known = { diem_den: 'Đà Nẵng', ngay: 'cuối tuần', so_nguoi: '1 người', phuong_tien: 'máy bay', thoi_gian: 'cuối tuần này', gio: 'sáng' }
const thread = 'vé máy bay đi Đà Nẵng . Cuối tuần này · Sáng · 1 người'
const WED = new Date('2026-09-30T05:00:00Z') // Wednesday 30/09/2026, 12:00 GMT+7

describe('R25 flight — a fare link (route + date) or the turn fails', () => {
  it('the answer to the ask card runs the FARE call, origin TP.HCM assumed, date = the coming Saturday', () => {
    const c = travelPreCall(known, thread, WED)
    expect(c).toMatchObject({ name: 'get_flight_prices', args: { origin: 'TP.HCM', destination: 'Đà Nẵng', departDate: '2026-10-03' } })
    expect(c?.assumed).toEqual({ origin: 'TP.HCM', date: '2026-10-03' })
  })
  it('the ticket words come from the whole thread — the answer alone ("Cuối tuần này · Sáng · 1 người") has none', () => {
    // phuong_tien = máy bay still makes it a fare call; without it the OLD text-only read gave a hotel search
    expect(travelPreCall({ ...known, phuong_tien: '' }, 'Cuối tuần này · Sáng · 1 người', WED)?.name).toBe('get_hotel_prices')
    expect(travelPreCall({ ...known, phuong_tien: '' }, thread, WED)?.name).toBe('get_flight_prices')
  })
  it('what the user said is never overridden or reported as assumed', () => {
    const c = travelPreCall({ ...known, xuat_phat: 'Hà Nội', ngay: '15/10' }, thread, WED)
    expect(c).toMatchObject({ name: 'get_flight_prices', args: { origin: 'Hà Nội', destination: 'Đà Nẵng', departDate: '2026-10-15' } })
    expect(c?.assumed).toBeUndefined()
  })
  it('a flight TO TP.HCM does not invent TP.HCM as its origin', () => {
    expect(travelPreCall({ ...known, diem_den: 'TP.HCM' }, thread, WED)?.name).not.toBe('get_flight_prices')
  })
  it('a vague date ("tuần sau", "chưa chốt") gets no invented date — the link builder\'s own default applies', () => {
    const c = travelPreCall({ ...known, ngay: 'tuần sau', thoi_gian: 'tuần sau' }, thread, WED)
    expect(c?.name).toBe('get_flight_prices')
    expect(c?.args.departDate).toBeUndefined()
    expect(c?.assumed).toEqual({ origin: 'TP.HCM' })
  })
  it('a hotel trip is untouched (no origin default, no relative date)', () => {
    const c = travelPreCall({ diem_den: 'Đà Nẵng', so_ngay: '3', ngay: 'cuối tuần', phuong_tien: 'máy bay' }, 'đi Đà Nẵng 3 ngày 2 đêm, đi máy bay', WED)
    expect(c).toEqual({ name: 'get_hotel_prices', args: { location: 'Đà Nẵng' } })
  })
})

describe('relativeDateIso (GMT+7)', () => {
  it('weekend, tomorrow, today, the day after', () => {
    expect(relativeDateIso('cuối tuần này', WED)).toBe('2026-10-03') // Wed → Sat
    expect(relativeDateIso('cuối tuần', new Date('2026-10-03T03:00:00Z'))).toBe('2026-10-03') // Saturday → today
    expect(relativeDateIso('cuối tuần này', new Date('2026-10-04T03:00:00Z'))).toBe('2026-10-04') // Sunday → today
    expect(relativeDateIso('cuối tuần sau', WED)).toBe('2026-10-10')
    expect(relativeDateIso('ngày mai', WED)).toBe('2026-10-01')
    expect(relativeDateIso('hôm nay', WED)).toBe('2026-09-30')
    expect(relativeDateIso('ngày kia', WED)).toBe('2026-10-02')
  })
  it('vague or unrelated text → no date', () => {
    for (const t of ['tuần sau', 'tháng sau', 'chưa chốt', '1 mình', 'một mình sáng', undefined]) expect(relativeDateIso(t, WED)).toBeUndefined()
  })
  it('the GMT+7 day, not the UTC day: 20:00 UTC on Friday is already Saturday in Vietnam', () => {
    expect(relativeDateIso('hôm nay', new Date('2026-10-02T20:00:00Z'))).toBe('2026-10-03')
  })
})
