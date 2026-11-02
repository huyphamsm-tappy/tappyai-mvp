import { describe, expect, it } from 'vitest'
import {
  allowedBookingUrl, callProvider, claimableFare, claimableSeats, claimableShowtime, claimableTicketPrice, fareSentence, freshness,
  FRESHNESS_TTL_MS, normalizeBus, normalizeFlight, normalizeShowtime, PROVIDER_ACCESS, reuseCarried,
  type BusResult, type FlightResult,
} from './travelData'

const NOW = new Date('2026-10-04T10:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const flightRaw = (over: Record<string, unknown> = {}) => ({
  flight_id: 'VJ123-20261005', airline: 'Vietjet', origin: 'SGN', destination: 'UIH',
  departure: '2026-10-05T06:00:00+07:00', arrival: '2026-10-05T07:10:00+07:00', duration_min: 70,
  fare: 1_250_000, currency: 'VND', availability: 9,
  booking_url: 'https://www.traveloka.com/vi-vn/flight/fullsearch?ap=SGN.UIH&dt=05-10-2026', verified_at: ago(60_000), source_status: 'VERIFIED',
  ...over,
})
const busRaw = (over: Record<string, unknown> = {}) => ({
  trip_id: 'T-778', operator: 'Phương Trang', origin: 'TP.HCM', destination: 'Đà Lạt',
  departure: '2026-10-05T22:00:00+07:00', arrival: '2026-10-06T05:00:00+07:00', duration_min: 420, vehicle_type: 'Giường nằm 40 chỗ',
  fare: 300_000, currency: 'VND', available_seats: 12, pickup_points: ['Bến xe Miền Đông mới'], dropoff_points: ['Bến xe Liên tỉnh Đà Lạt'],
  booking_url: 'https://vexere.com/vi-VN/ve-xe-khach-tu-sai-gon-di-da-lat', verified_at: ago(60_000), source_status: 'VERIFIED',
  ...over,
})
const showRaw = (over: Record<string, unknown> = {}) => ({
  movie_id: 'm-1', movie_title: 'Phim A', cinema_id: 'c-9', cinema_name: 'Rạp B', address: '1 Lê Lợi, Q1',
  showtime: '2026-10-04T19:00:00+07:00', date: '2026-10-04', format: '2D', language: 'Phụ đề', ticket_price: 95_000, availability: 30,
  booking_url: 'https://moveek.com/x', verified_at: ago(60_000), source_status: 'VERIFIED',
  ...over,
})

describe('Traveloka flights (FlightResult)', () => {
  it('valid VERIFIED fresh record → fare and seats claimable, URL kept', () => {
    const r = normalizeFlight('traveloka', flightRaw(), NOW)!
    expect(r.source_status).toBe('VERIFIED')
    expect(claimableFare(r, NOW)).toBe(1_250_000)
    expect(claimableSeats(r, NOW)).toBe(9)
    expect(r.booking_url).toMatch(/^https:\/\/www\.traveloka\.com\//)
    expect(fareSentence(r, NOW)).toBe('Giá hiện tại là 1.250.000đ.')
  })
  it('unavailable: no access → access_pending, never a fabricated result', async () => {
    const out = await callProvider('traveloka', raw => normalizeFlight('traveloka', raw, NOW), null)
    expect(out).toEqual({ status: 'UNAVAILABLE', reason: 'access_pending', detail: PROVIDER_ACCESS.traveloka.officialChannel })
  })
  it('stale: verified 20 min ago → STALE, fare not claimable, honest sentence', () => {
    const r = normalizeFlight('traveloka', flightRaw({ verified_at: ago(20 * 60_000) }), NOW)!
    expect(r.source_status).toBe('STALE')
    expect(claimableFare(r, NOW)).toBeNull()
    expect(fareSentence(r, NOW)).toBe('Hiện Tappy chưa xác minh được giá realtime.')
  })
  it('malformed: missing id / bad origin / non-object → rejected', () => {
    expect(normalizeFlight('traveloka', flightRaw({ flight_id: undefined }), NOW)).toBeNull()
    expect(normalizeFlight('traveloka', flightRaw({ origin: '<script>' }), NOW)).toBeNull()
    expect(normalizeFlight('traveloka', 'oops', NOW)).toBeNull()
  })
  it('missing fare / fare without currency → fare null, honest sentence', () => {
    for (const over of [{ fare: null }, { fare: -5 }, { currency: 'EUR' }, { fare: '1.250.000' }]) {
      const r = normalizeFlight('traveloka', flightRaw(over), NOW)!
      expect(r.fare).toBeNull()
      expect(fareSentence(r, NOW)).toBe('Hiện Tappy chưa xác minh được giá realtime.')
    }
  })
  it('missing availability → null, seats not claimable', () => {
    const r = normalizeFlight('traveloka', flightRaw({ availability: 'còn vé' }), NOW)!
    expect(r.availability).toBeNull()
    expect(claimableSeats(r, NOW)).toBeNull()
  })
  it('invalid booking URL → dropped (other host, http, credentials, javascript:)', () => {
    for (const u of ['https://evil.example/traveloka.com', 'http://www.traveloka.com/x', 'https://u:p@www.traveloka.com/x', 'javascript:alert(1)', 'https://vexere.com/x']) {
      expect(normalizeFlight('traveloka', flightRaw({ booking_url: u }), NOW)!.booking_url).toBeNull()
    }
  })
  it('timeout → UNAVAILABLE/timeout, no throw', async () => {
    const out = await callProvider('traveloka', r => normalizeFlight('traveloka', r, NOW), () => new Promise(() => {}), 20)
    expect(out).toEqual({ status: 'UNAVAILABLE', reason: 'timeout' })
  })
  it('provider error → UNAVAILABLE/provider_error, message not leaked', async () => {
    const out = await callProvider('traveloka', r => normalizeFlight('traveloka', r, NOW), async () => { throw new Error('401 token=abc') })
    expect(out).toEqual({ status: 'UNAVAILABLE', reason: 'provider_error' })
    expect(JSON.stringify(out)).not.toContain('token')
  })
  it('provider claims VERIFIED without timestamp → UNVERIFIED; anything not VERIFIED is never upgraded', () => {
    expect(normalizeFlight('traveloka', flightRaw({ verified_at: null }), NOW)!.source_status).toBe('UNVERIFIED')
    expect(normalizeFlight('traveloka', flightRaw({ source_status: 'live' }), NOW)!.source_status).toBe('UNVERIFIED')
  })
})

describe('Vexere buses (BusResult)', () => {
  it('valid record → all fields kept, fare claimable', () => {
    const r = normalizeBus('vexere', busRaw(), NOW)!
    expect(r).toMatchObject({ operator: 'Phương Trang', available_seats: 12, pickup_points: ['Bến xe Miền Đông mới'], source_status: 'VERIFIED' })
    expect(claimableFare(r, NOW)).toBe(300_000)
    expect(claimableSeats(r, NOW)).toBe(12)
  })
  it('unavailable: no access → access_pending', async () => {
    const out = await callProvider('vexere', raw => normalizeBus('vexere', raw, NOW), null)
    expect(out.status).toBe('UNAVAILABLE')
  })
  it('stale seats: 6 min old → seats not claimable while fare still is', () => {
    const r = normalizeBus('vexere', busRaw({ verified_at: ago(6 * 60_000) }), NOW)!
    expect(claimableSeats(r, NOW)).toBeNull()
    expect(claimableFare(r, NOW)).toBe(300_000)
  })
  it('malformed batch (every record invalid) → UNAVAILABLE/malformed', async () => {
    const out = await callProvider('vexere', raw => normalizeBus('vexere', raw, NOW), async () => [{ nope: 1 }, null])
    expect(out).toEqual({ status: 'UNAVAILABLE', reason: 'malformed' })
  })
  it('non-array payload → malformed', async () => {
    const out = await callProvider('vexere', raw => normalizeBus('vexere', raw, NOW), async () => ({ data: [] }) as unknown as unknown[])
    expect(out).toEqual({ status: 'UNAVAILABLE', reason: 'malformed' })
  })
  it('missing fare / missing seats → null', () => {
    const r = normalizeBus('vexere', busRaw({ fare: undefined, available_seats: -1 }), NOW)!
    expect(r.fare).toBeNull()
    expect(r.available_seats).toBeNull()
  })
  it('invalid booking URL (traveloka host on a vexere record) → dropped', () => {
    expect(normalizeBus('vexere', busRaw({ booking_url: 'https://www.traveloka.com/x' }), NOW)!.booking_url).toBeNull()
  })
  it('timeout + provider error → UNAVAILABLE', async () => {
    expect((await callProvider('vexere', r => normalizeBus('vexere', r, NOW), () => new Promise(() => {}), 20)).status).toBe('UNAVAILABLE')
    expect((await callProvider('vexere', r => normalizeBus('vexere', r, NOW), async () => { throw new Error('500') })).status).toBe('UNAVAILABLE')
  })
  it('pickup list from provider is bounded and cleaned', () => {
    const r = normalizeBus('vexere', busRaw({ pickup_points: ['A', 3, '', ...Array.from({ length: 30 }, (_, i) => `P${i}`)] }), NOW)!
    expect(r.pickup_points.length).toBe(20)
    expect(r.pickup_points[0]).toBe('A')
  })
})

describe('Moveek showtimes (CinemaShowtimeResult) — STATE C', () => {
  it('no official channel → no credentials declared, every call access_pending', async () => {
    expect(PROVIDER_ACCESS.moveek.credentialEnv).toEqual([])
    expect((await callProvider('moveek', r => normalizeShowtime('moveek', r, NOW), null)).status).toBe('UNAVAILABLE')
  })
  it('no programme → no booking host is allowed for moveek', () => {
    expect(allowedBookingUrl('moveek', 'https://moveek.com/x')).toBeNull()
    expect(normalizeShowtime('moveek', showRaw(), NOW)!.booking_url).toBeNull()
  })
  it('contract semantics still hold: stale showtime/price not claimable', () => {
    const fresh = normalizeShowtime('moveek', showRaw(), NOW)!
    expect(claimableShowtime(fresh, NOW)).toBe('2026-10-04T19:00:00+07:00')
    expect(claimableTicketPrice(fresh, NOW)).toBe(95_000)
    const old = normalizeShowtime('moveek', showRaw({ verified_at: ago(7 * 60 * 60_000) }), NOW)!
    expect(old.source_status).toBe('STALE')
    expect(claimableShowtime(old, NOW)).toBeNull()
    expect(claimableTicketPrice(old, NOW)).toBeNull()
  })
  it('malformed / missing price / missing availability', () => {
    expect(normalizeShowtime('moveek', showRaw({ movie_title: '' }), NOW)).toBeNull()
    const r = normalizeShowtime('moveek', showRaw({ ticket_price: 'liên hệ', availability: undefined }), NOW)!
    expect(r.ticket_price).toBeNull()
    expect(r.availability).toBeNull()
  })
})

describe('freshness', () => {
  it('future timestamp is not evidence; non-VERIFIED statuses pass through', () => {
    expect(freshness('VERIFIED', new Date(NOW.getTime() + 3_600_000).toISOString(), FRESHNESS_TTL_MS.fare, NOW)).toBe('UNVERIFIED')
    expect(freshness('UNAVAILABLE', ago(0), FRESHNESS_TTL_MS.fare, NOW)).toBe('UNAVAILABLE')
  })
})

describe('context reuse (§7)', () => {
  const flights = [
    normalizeFlight('traveloka', flightRaw(), NOW)!,
    normalizeFlight('traveloka', flightRaw({ flight_id: 'VJ125', departure: '2026-10-05T18:00:00+07:00' }), NOW)!,
  ] as FlightResult[]
  const morning = (r: FlightResult) => !!r.departure && Number(r.departure.slice(11, 13)) < 12
  it('"có chuyến sáng không?" on fresh carried results → reuse the subset, no call', () => {
    const out = reuseCarried(flights, morning, FRESHNESS_TTL_MS.fare, NOW)
    expect(out).toEqual({ action: 'reuse', results: [flights[0]] })
  })
  it('"giá bao nhiêu?" after the fare went stale → ONE refresh of the same query, not a plan rerun', () => {
    const later = new Date(NOW.getTime() + 30 * 60_000)
    expect(reuseCarried(flights, () => true, FRESHNESS_TTL_MS.fare, later)).toEqual({ action: 'refresh_same_query' })
  })
  it('follow-up that matches nothing carried → none_matching (no invented trip)', () => {
    const buses = [normalizeBus('vexere', busRaw(), NOW)!] as BusResult[]
    expect(reuseCarried(buses, r => r.operator === 'Thành Bưởi', FRESHNESS_TTL_MS.fare, NOW)).toEqual({ action: 'none_matching' })
  })
  it('UNVERIFIED carried results are reused as UNVERIFIED (they never become a price claim)', () => {
    const r = normalizeFlight('traveloka', flightRaw({ source_status: undefined }), NOW)!
    const out = reuseCarried([r], () => true, FRESHNESS_TTL_MS.fare, NOW)
    expect(out.action).toBe('reuse')
    expect(fareSentence(r, NOW)).toBe('Hiện Tappy chưa xác minh được giá realtime.')
  })
})

describe('security (§10)', () => {
  it('results never carry credential-like fields; access table holds env NAMES only', () => {
    const r = normalizeFlight('traveloka', flightRaw({ token: 'secret', api_key: 'k', headers: { a: 1 } }), NOW)!
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['token']))
    expect(JSON.stringify(r)).not.toMatch(/secret|api_key|headers/)
    for (const a of Object.values(PROVIDER_ACCESS)) for (const n of a.credentialEnv) expect(n).toMatch(/^[A-Z0-9_]+$/)
  })
})
