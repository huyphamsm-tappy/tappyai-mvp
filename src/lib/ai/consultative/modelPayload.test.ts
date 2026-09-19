import { describe, it, expect } from 'vitest'
import { trimPlacesForModel, MODEL_ROWS_MAX } from './modelPayload'

// Item 2 (2026-09-19): stage 1 — the model reads EVERY row (up to the provider's 10) in compact
// form; the card keeps the full result (built before this runs).

const row = (i: number, extra: Record<string, unknown> = {}) => ({
  name: `Quán ${i}`, place_id: `p${i}`, address: `${i} Nguyễn Huệ`, lat: 10.7, lng: 106.7, phone: '028',
  website_uri: 'https://x', maps_link: `https://maps.google.com/?cid=${i}`, google_rating: '4.5⭐ (100 đánh giá)', rating_value: 4.5,
  rating_count: 100, price_range_text: '100-200 N ₫', opening_hours: '08:00–22:00', open_now: true,
  opening_hours_week: { 'Thứ Hai': '08:00–22:00', 'Thứ Ba': '08:00–22:00' }, distance_km: 1.2, place_types: ['Nhà hàng'],
  photo_url: 'https://img', photo_urls: ['https://img'], has_tiktok_review: false, has_maps: true, has_phone: true, has_photo: true,
  review_actions: [{ kind: 'tiktok', label: '🎵 Review', url: 'https://www.tiktok.com/@x/video/1', attributed: true }, { kind: 'google_maps', label: 'Maps', url: 'https://maps.google.com/?cid=1', attributed: true }],
  booking_links: ['https://book/x'], ...extra,
})
const ten = Array.from({ length: 10 }, (_, i) => row(i))

describe('trimPlacesForModel (stage 1: every row, compact)', () => {
  it('keeps the shortlist members first, then every other row, each with the citable fields only', () => {
    const out = trimPlacesForModel({ results: ten, _tappy_shortlist: [{ id: 'p7', name: 'Quán 7' }, { id: 'p0', name: 'Quán 0' }], google_maps_search: 'https://maps' }) as Record<string, unknown>
    const rows = out.results as Array<Record<string, unknown>>
    expect(rows).toHaveLength(10)
    expect(rows.map(r => r.name)).toEqual(['Quán 0', 'Quán 7', 'Quán 1', 'Quán 2', 'Quán 3', 'Quán 4', 'Quán 5', 'Quán 6', 'Quán 8', 'Quán 9'])
    for (const r of rows) {
      // Dropped: what the card renders and the model never argues with.
      for (const k of ['lat', 'lng', 'opening_hours_week', 'photo_url', 'photo_urls', 'has_maps', 'has_phone', 'has_photo']) expect(r, k).not.toHaveProperty(k)
      // Kept: the evidence a pick is argued with + the URL fields the CTA / review rules read.
      for (const k of ['address', 'phone', 'google_rating', 'price_range_text', 'distance_km', 'open_now', 'opening_hours', 'place_types', 'maps_link', 'booking_links', 'website_uri', 'has_tiktok_review']) expect(r, k).toHaveProperty(k)
      // Item 6: the formatted rating is cited; its numeric twins stay with the full row (ranker, guards).
      expect(r).not.toHaveProperty('rating_value'); expect(r).not.toHaveProperty('rating_count')
      expect(r.review_actions).toEqual([{ kind: 'tiktok', url: 'https://www.tiktok.com/@x/video/1', attributed: true }])
    }
    expect(String(out.results_note)).toMatch(/TOAN BO 10 ket qua/)
    expect(out.google_maps_search).toBe('https://maps')
  })
  it('item 6: numeric rating twins stay when there is no formatted string; the aggregate maps link leaves when the card renders', () => {
    const out = trimPlacesForModel({ results: [{ name: 'A', rating: 4.4, user_ratings_total: 200, rating_value: 4.4, rating_count: 200 }], google_maps_search: 'https://maps' }) as Record<string, unknown>
    expect((out.results as Array<Record<string, unknown>>)[0]).toMatchObject({ rating: 4.4, user_ratings_total: 200, rating_value: 4.4, rating_count: 200 })
    expect(out.google_maps_search).toBe('https://maps')
    const card = trimPlacesForModel({ results: ten, google_maps_search: 'https://maps' }, 'results', { rendersCard: true }) as Record<string, unknown>
    expect(card).not.toHaveProperty('google_maps_search')
  })
  it('caps at the provider ceiling and says so', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => row(i))
    const out = trimPlacesForModel({ results: twelve }) as Record<string, unknown>
    expect((out.results as unknown[]).length).toBe(MODEL_ROWS_MAX)
    expect(String(out.results_note)).toMatch(/10\/12/)
  })
  it('trims hotel_list the same way when asked (get_hotel_prices)', () => {
    const hotels = Array.from({ length: 18 }, (_, i) => ({ ...row(i), name: `Hotel ${i}`, stars: 3 }))
    const out = trimPlacesForModel({ hotel_list: hotels, booking_link: 'x', _tappy_shortlist: [{ id: 'p9', name: 'Hotel 9' }] }, 'hotel_list') as Record<string, unknown>
    const rows = out.hotel_list as Array<Record<string, unknown>>
    expect(rows).toHaveLength(MODEL_ROWS_MAX)
    expect(rows[0].name).toBe('Hotel 9')
    expect(rows[0]).toHaveProperty('stars')
    expect(rows[0]).not.toHaveProperty('photo_url')
    expect(rows[0]).not.toHaveProperty('lat')
    expect(String(out.results_note)).toMatch(/10\/18/)
    expect(out.booking_link).toBe('x')
  })
  it('leaves non-place results and empty results alone', () => {
    expect(trimPlacesForModel({ results: [] })).toEqual({ results: [] })
    expect(trimPlacesForModel('x')).toBe('x')
    const err = { error: 'x', results: [] }
    expect(trimPlacesForModel(err)).toEqual(err)
  })
})
