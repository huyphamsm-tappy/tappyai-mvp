import { describe, it, expect } from 'vitest'
import { trimPlacesForModel, MODEL_ROWS_MAX } from './modelPayload'

// Cost optimization item 4: the model reads the decision set (shortlist ∪ top rows, ≤5) with the
// fields it cites; the card keeps the full result (built before this runs).

const row = (i: number, extra: Record<string, unknown> = {}) => ({
  name: `Quán ${i}`, place_id: `p${i}`, address: `${i} Nguyễn Huệ`, lat: 10.7, lng: 106.7, phone: '028',
  website_uri: 'https://x', maps_link: `https://maps.google.com/?cid=${i}`, google_rating: '4.5⭐ (100 đánh giá)', rating_value: 4.5,
  rating_count: 100, price_range_text: '100-200 N ₫', opening_hours: '08:00–22:00', open_now: true,
  opening_hours_week: { 'Thứ Hai': '08:00–22:00', 'Thứ Ba': '08:00–22:00' }, distance_km: 1.2, place_types: ['Nhà hàng'],
  photo_url: 'https://img', photo_urls: ['https://img'], has_tiktok_review: false, ...extra,
})
const ten = Array.from({ length: 10 }, (_, i) => row(i))

describe('trimPlacesForModel', () => {
  it('keeps the shortlist members first, fills to five, drops the rest and the un-cited fields', () => {
    const out = trimPlacesForModel({ results: ten, _tappy_shortlist: [{ id: 'p7', name: 'Quán 7' }, { id: 'p0', name: 'Quán 0' }], google_maps_search: 'https://maps' }) as Record<string, unknown>
    const rows = out.results as Array<Record<string, unknown>>
    expect(rows).toHaveLength(MODEL_ROWS_MAX)
    expect(rows.map(r => r.name)).toEqual(['Quán 0', 'Quán 7', 'Quán 1', 'Quán 2', 'Quán 3'])
    for (const r of rows) {
      expect(r).not.toHaveProperty('lat'); expect(r).not.toHaveProperty('opening_hours_week'); expect(r).not.toHaveProperty('photo_url')
      expect(r).toHaveProperty('google_rating'); expect(r).toHaveProperty('opening_hours'); expect(r).toHaveProperty('maps_link'); expect(r).toHaveProperty('phone')
    }
    expect(out.results_note).toContain('5/10')
    expect(out.google_maps_search).toBe('https://maps')
  })
  it('a five-member shortlist keeps all five; fewer rows than the limit keeps them all with no note', () => {
    const five = trimPlacesForModel({ results: ten, _tappy_shortlist: ten.slice(0, 5).map(r => ({ id: r.place_id, name: r.name })) }) as Record<string, unknown>
    expect((five.results as unknown[]).length).toBe(5)
    const three = trimPlacesForModel({ results: ten.slice(0, 3) }) as Record<string, unknown>
    expect((three.results as unknown[]).length).toBe(3)
    expect(three.results_note).toBeUndefined()
  })
  it('leaves non-place results and empty results alone', () => {
    expect(trimPlacesForModel({ results: [] })).toEqual({ results: [] })
    expect(trimPlacesForModel('x')).toBe('x')
    const err = { error: 'x', results: [] }
    expect(trimPlacesForModel(err)).toEqual(err)
  })
})
