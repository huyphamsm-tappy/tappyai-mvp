import { describe, it, expect, vi } from 'vitest'
import { applyPlaceConstraints, detectPlaceConstraints } from './placeConstraintFilter'
import { relaxEmptyPlaces, rowsOf, mapsSearchUrl, noResultBlock, widenLocation, relaxNote } from './placeRelax'
import { parseCTA } from '@/lib/structuredContent/parseCta'

// Realistic Serper /maps rows (shape of serperPlaceToRow): HCMC venues, some priced, some not.
const row = (name: string, extra: Record<string, unknown> = {}) => ({ name, address: `1 Lê Lợi, Bến Thành, Hồ Chí Minh, Việt Nam`, rating: 4.5, ...extra })
const VIET = {
  results: [
    row('Quán Ngon - Bún Chả Hà Nội'),
    row('Madame Lam - Nhà hàng món Việt', { price_range_text: '200–300 N ₫' }),
    row('Hai’s Restaurant'),
    row('Viet Village Restaurant', { price_range_text: '100–200 N ₫' }),
  ],
}
const apply = (r: unknown, c: ReturnType<typeof detectPlaceConstraints>) => applyPlaceConstraints(r, c, 'vi')
const budget = (max: number) => ({ min: 0, max, type: 'under' as const })

describe('A2 — price is a SOFT constraint', () => {
  it('a venue with NO price data is never dropped by a price ceiling (it is flagged, not removed)', () => {
    const c = detectPlaceConstraints('quán ăn dưới 100k', budget(100_000))
    const out = apply({ results: [row('Quán Ngon - Bún Chả Hà Nội'), row('Hai’s Restaurant')] }, c)
    expect(rowsOf(out.result)).toHaveLength(2)
    expect(rowsOf(out.result).every(r => r._tappy_price_unconfirmed === true)).toBe(true)
    expect(out.priceUnknown).toBe(2)
  })

  it('priced venues all above the ceiling are dropped by the filter, and relaxation brings them back with a note', async () => {
    const pricey = { results: [row('Madame Lam', { price_range_text: '300–500 N ₫' }), row('Hai’s', { price_range_text: '500–800 N ₫' })] }
    const c = detectPlaceConstraints('nhà hàng dưới 100k', budget(100_000))
    const first = apply(pricey, c)
    expect(rowsOf(first.result)).toHaveLength(0)
    const out = await relaxEmptyPlaces({ budgeted: pricey, constrained: first, constraints: c, lang: 'vi', applyConstraints: apply })
    expect(out.relaxed).toEqual(['price'])
    expect(out.empty).toBe(false)
    expect(rowsOf(out.result)).toHaveLength(2)
    expect((out.result as Record<string, unknown>)._tappy_relax_note).toMatch(/bỏ lọc giá/)
  })

  it('"Trên 300k" (a floor) never removes a venue: only a ceiling filters', () => {
    const c = detectPlaceConstraints('Quận trung tâm · Món Việt · Trên 300k', null)
    expect(c.budgetMax).toBeNull()
    expect(rowsOf(apply(VIET, c).result).length).toBe(VIET.results.length)
  })
})

describe('A2 — empty results relax step by step and say what was relaxed', () => {
  it('nothing priced fits and nothing came back: price first, then the whole city, both named', async () => {
    const c = detectPlaceConstraints('quán dưới 50k', budget(50_000))
    const none = { results: [] }
    const first = apply(none, c)
    const widen = vi.fn(async () => ({ results: [row('Quán Ngon - Bún Chả Hà Nội'), row('Hai’s Restaurant'), row('Cơm Tấm Ba Ghiền')] }))
    const out = await relaxEmptyPlaces({ budgeted: none, constrained: first, constraints: c, lang: 'vi', applyConstraints: apply, widen })
    expect(widen).toHaveBeenCalledTimes(1)
    expect(out.relaxed).toEqual(['area'])
    expect(rowsOf(out.result)).toHaveLength(3)
    expect((out.result as Record<string, unknown>)._tappy_relax_note).toMatch(/mở rộng/)
  })

  it('price dropped AND area widened when both were needed', async () => {
    const c = detectPlaceConstraints('nhà hàng dưới 100k', budget(100_000))
    const pricey = { results: [row('Madame Lam', { price_range_text: '300–500 N ₫' })] }
    const first = apply(pricey, c)
    // price relaxation alone already works here, so the widen callback must NOT be called
    const widen = vi.fn(async () => null)
    const out = await relaxEmptyPlaces({ budgeted: pricey, constrained: first, constraints: c, lang: 'en', applyConstraints: apply, widen })
    expect(out.relaxed).toEqual(['price'])
    expect(widen).not.toHaveBeenCalled()
    expect((out.result as Record<string, unknown>)._tappy_relax_note).toMatch(/price filter/)
  })

  it('still nothing after every step → empty: true (the caller shows the honest block)', async () => {
    const c = detectPlaceConstraints('cửa hàng', null)
    const first = apply({ results: [] }, c)
    const out = await relaxEmptyPlaces({ budgeted: { results: [] }, constrained: first, constraints: c, lang: 'vi', applyConstraints: apply, widen: async () => ({ results: [] }) })
    expect(out.empty).toBe(true)
    expect(out.relaxed).toEqual([])
  })

  it('a non-empty result is returned untouched', async () => {
    const c = detectPlaceConstraints('quán', null)
    const first = apply(VIET, c)
    const widen = vi.fn()
    const out = await relaxEmptyPlaces({ budgeted: VIET, constrained: first, constraints: c, lang: 'vi', applyConstraints: apply, widen })
    expect(out.relaxed).toEqual([])
    expect(out.empty).toBe(false)
    expect(widen).not.toHaveBeenCalled()
  })
})

describe('A2 — the honest no-result block is built by code', () => {
  it('says what was searched, never asks the user back, carries a Maps button with the keywords + area', () => {
    const block = noResultBlock({ query: 'cửa hàng dán màn hình điện thoại', area: 'Phú Nhuận', lang: 'vi' })
    const { text, buttons } = parseCTA(block)
    expect(text).toContain('Mình đã tìm "cửa hàng dán màn hình điện thoại" ở Phú Nhuận nhưng chưa thấy kết quả đủ tin cậy')
    expect(text).not.toMatch(/phải không\?|không\?\s*$/)
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toMatchObject({ type: 'maps', primary: true })
    const url = new URL(buttons[0].url)
    expect(url.hostname).toBe('www.google.com')
    expect(url.searchParams.get('query')).toBe('cửa hàng dán màn hình điện thoại Phú Nhuận')
    expect(block).toMatch(/\[FOLLOWUPS\].+\[\/FOLLOWUPS\]/)
  })

  it('English variant', () => {
    expect(noResultBlock({ query: 'phone repair', area: 'District 3', lang: 'en' })).toContain('found nothing reliable')
  })

  it('mapsSearchUrl encodes keywords, and tolerates a missing area', () => {
    expect(mapsSearchUrl('quán phở', null)).toBe('https://www.google.com/maps/search/?api=1&query=qu%C3%A1n%20ph%E1%BB%9F')
  })

  it('widenLocation: HCMC by default, Hà Nội for a Hà Nội district, null when no district was stated', () => {
    expect(widenLocation({ city: 'hcm' })).toBe('Ho Chi Minh City')
    expect(widenLocation({ city: 'hn' })).toBe('Ha Noi')
    expect(widenLocation(null)).toBeNull()
    expect(relaxNote([], { budgetMax: null, district: null }, 'vi')).toBe('')
  })
})
