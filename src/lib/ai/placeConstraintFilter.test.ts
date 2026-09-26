import { describe, expect, it } from 'vitest'
import { applyPlaceConstraints, detectPlaceConstraints, parsePriceBand, venueTypeOf } from './placeConstraintFilter'
import { extractBudget } from './budget'

// ── Phase 7 group 3 (2026-09-22): constraints shape the rows, not only the text ──
//
// Golden set T3 turn 2: "chọn quán rẻ tiền thôi, 50-60k thôi mé gì toàn nhà hàng" — the card kept
// "NHÀ HÀNG NGON" and "Quán Bụi" (both nhà hàng, both above budget) while the prose picked one
// cheap place. The rows below are the measured Serper shapes from that run.

const row = (name: string, price_range_text?: string, open_now?: boolean) => ({
  name, address: 'Quận 1, TP.HCM', rating_value: 4.5, rating_count: 500,
  ...(price_range_text ? { price_range_text } : {}),
  ...(open_now === undefined ? {} : { open_now }),
})

// A fixed instant: Monday 2026-09-21 12:15 Vietnam time (05:15Z) — lunch.
const LUNCH = new Date('2026-09-21T05:15:00Z')
// Monday 21:00 Vietnam (14:00Z) — evening.
const EVENING = new Date('2026-09-21T14:00:00Z')

describe('parsePriceBand', () => {
  it('reads the Serper bands the golden run carried', () => {
    expect(parsePriceBand('1-100.000 ₫')).toEqual({ lo: 0, hi: 100000 })
    expect(parsePriceBand('100-200 N ₫')).toEqual({ lo: 100000, hi: 200000 })
    expect(parsePriceBand('200.000-400.000 ₫')).toEqual({ lo: 200000, hi: 400000 })
    expect(parsePriceBand('Trên 1 Tr ₫')).toEqual({ lo: 1_000_000, hi: null })
    expect(parsePriceBand('200-400 N ₫')).toEqual({ lo: 200000, hi: 400000 })
  })
  it('never invents a band', () => {
    expect(parsePriceBand(undefined)).toBeNull()
    expect(parsePriceBand('$$')).toBeNull()
    expect(parsePriceBand('')).toBeNull()
  })
})

describe('detectPlaceConstraints', () => {
  it('🚨 T3 turn 2: cheap + "toàn nhà hàng" rules restaurants out, keeps the 60k ceiling', () => {
    const text = 'chọn quán rẻ tiền thôi, 50-60k thôi mé gì toàn nhà hàng'
    const budget = extractBudget(text)
    expect(budget?.max).toBe(60000)
    const c = detectPlaceConstraints(text, budget, [], LUNCH)
    expect(c.budgetMax).toBe(60000)
    expect(c.exclude).toEqual(['restaurant'])
  })

  it('G3b: "thôi không nhậu nữa" rules drinking venues out on the correction turn only', () => {
    const c = detectPlaceConstraints('thôi không nhậu nữa, quán ăn gia đình thôi, 100-150k/người', extractBudget('100-150k'), ['tìm quán nhậu ở Quận 1 tối nay'], EVENING)
    expect(c.exclude).toEqual(['drinking'])
    expect(c.budgetMax).toBe(150000)
    // "tối nay" from the earlier turn still means now, in the evening.
    expect(c.openNow).toBe(true)
  })

  it('"trưa nay" is now at lunch and not now in the evening', () => {
    expect(detectPlaceConstraints('trưa nay ăn gì cho ngon', null, [], LUNCH).openNow).toBe(true)
    expect(detectPlaceConstraints('trưa nay ăn gì cho ngon', null, [], EVENING).openNow).toBe(false)
  })

  it('"đang mở cửa" is now at any hour; a plain search is not', () => {
    expect(detectPlaceConstraints('cafe yên tĩnh Q3 đang mở cửa', null, [], EVENING).openNow).toBe(true)
    // "Q3" is a district the user named, so it is now read as one (PRELAUNCH 5b); nothing else is set.
    const c = detectPlaceConstraints('cafe yên tĩnh Q3', null, [], EVENING)
    expect(c).toMatchObject({ budgetMax: null, exclude: [], openNow: false })
    expect(c.district?.label).toBe('Quận 3')
  })

  it('the earlier turn lends its time only when this turn names none', () => {
    const c = detectPlaceConstraints('rẻ tiền thôi', null, ['trưa nay ăn gì'], LUNCH)
    expect(c.openNow).toBe(true)
    const own = detectPlaceConstraints('tối nay ăn gì', null, ['trưa nay ăn gì'], LUNCH)
    expect(own.openNow).toBe(false)
  })
})

describe('applyPlaceConstraints', () => {
  const T3_ROWS = [
    row('NHÀ HÀNG NGON', '200.000-400.000 ₫'),
    row('Quán Bụi - Authentic Vietnamese Cuisine', '100-200 N ₫'),
    row('Cơm Tấm Ba Ghiền', '1-100.000 ₫'),
    row('Bún Chả Hà Nội 26', '1-100.000 ₫', false),
    row('Phở Hòa Pasteur'),
    row('Bánh Mì Huỳnh Hoa', '1-100.000 ₫'),
  ]

  it('🚨 T3: over-budget and ruled-out venues leave the rows; the card and the model share the set', () => {
    const c = detectPlaceConstraints('chọn quán rẻ tiền thôi, 50-60k thôi mé gì toàn nhà hàng', extractBudget('50-60k'), ['trưa nay ăn gì cho ngon'], LUNCH)
    const out = applyPlaceConstraints({ results: T3_ROWS, count: 6 }, c, 'vi')
    const names = ((out.result as { results: Array<{ name: string }> }).results).map(r => r.name)
    expect(names).not.toContain('NHÀ HÀNG NGON')
    expect(names).not.toContain('Quán Bụi - Authentic Vietnamese Cuisine')
    expect(out.dropped.map(d => d.reason).sort()).toEqual(['over_budget', 'venue_type'])
    // Bands that overlap 60k are kept (the provider's "1-100.000" cannot say more), the priced
    // rows come before the unpriced one, and the closed one is last.
    expect(names).toEqual(['Cơm Tấm Ba Ghiền', 'Bánh Mì Huỳnh Hoa', 'Phở Hòa Pasteur', 'Bún Chả Hà Nội 26'])
    expect(out.demotedClosed).toBe(1)
    expect(out.priceUnknown).toBe(1)
    expect((out.result as { count: number }).count).toBe(4)
  })

  it('the note tells the model what left and that an unpriced row is unconfirmed, never in budget', () => {
    const c = detectPlaceConstraints('50-60k thôi, toàn nhà hàng', extractBudget('50-60k'), [], LUNCH)
    const out = applyPlaceConstraints({ results: T3_ROWS }, c, 'vi')
    expect(out.note).toContain('HỆ THỐNG ĐÃ LOẠI')
    expect(out.note).toContain('vượt ngân sách 60k')
    expect(out.note).toContain('nhà hàng')
    expect(out.note).toContain('KHÔNG có dữ liệu giá')
    expect((out.result as Record<string, unknown>)._tappy_constraint_note).toBe(out.note)
  })

  it('says plainly when NO row is confirmed within budget', () => {
    const c = detectPlaceConstraints('dưới 60k', extractBudget('dưới 60k'), [], EVENING)
    const out = applyPlaceConstraints({ results: [row('A'), row('B', '1-100.000 ₫')] }, c, 'vi')
    expect(out.priceFits).toBe(0)
    expect(out.note).toContain('KHÔNG có chỗ nào được xác nhận nằm trong ngân sách')
  })

  it('a closed place cannot rank first when the request is for now', () => {
    const c = detectPlaceConstraints('cafe yên tĩnh đang mở cửa', null, [], EVENING)
    const out = applyPlaceConstraints({ results: [row('Closed Cafe', undefined, false), row('Open Cafe', undefined, true)] }, c, 'vi')
    expect((out.result as { results: Array<{ name: string }> }).results.map(r => r.name)).toEqual(['Open Cafe', 'Closed Cafe'])
    expect(out.note).toContain('ĐÓNG CỬA')
  })

  it('a request for another time leaves the schedule alone', () => {
    const c = detectPlaceConstraints('tối mai ăn gì', null, [], LUNCH)
    const input = { results: [row('Closed Now', undefined, false), row('Open Now', undefined, true)] }
    expect(applyPlaceConstraints(input, c, 'vi').result).toBe(input)
  })

  it('🚨 venue type: the provider TYPES decide first; the bare Google type "Nhà hàng" decides nothing; the name is the fallback', () => {
    const c = detectPlaceConstraints('bình dân thôi', null, [], EVENING)
    const rows = [
      { ...row('Cơm Ngon Hà Nội'), place_types: ['Nhà hàng châu Á'] },           // every eatery is a "Nhà hàng …" to Google
      { ...row('Béo Ơi Quán'), place_types: ['Nhà hàng'] },
      { ...row('The Deck Saigon'), place_types: ['Nhà hàng cao cấp', 'Nhà hàng'] }, // upscale by TYPE, no "nhà hàng" in the name
      { ...row('Bụi Garden'), place_types: ['Nhà hàng Việt Nam', 'Fine dining restaurant'] },
      row('Nhà hàng Ngọc Sương'),                                                  // no types → name fallback
    ]
    const out = applyPlaceConstraints({ results: rows }, c, 'vi')
    expect((out.result as { results: Array<{ name: string }> }).results.map(r => r.name)).toEqual(['Cơm Ngon Hà Nội', 'Béo Ơi Quán'])
    expect(out.dropped.map(d => d.name)).toEqual(['The Deck Saigon', 'Bụi Garden', 'Nhà hàng Ngọc Sương'])
  })

  it('drinking venues by TYPE: "Quán bia" is out on "thôi không nhậu" whatever the name says', () => {
    const c = detectPlaceConstraints('thôi không nhậu nữa, quán ăn gia đình thôi', null, [], EVENING)
    const rows = [
      { ...row('Pasteur Street Craft Beer'), place_types: ['Quán bia', 'Nhà hàng'] },
      { ...row('Ebisu District 1'), place_types: ['Nhà hàng Nhật', 'Quán rượu'] },
      { ...row('Bếp Mẹ Ỉn'), place_types: ['Nhà hàng Việt Nam'] },
      { ...row('Quán Ốc 79'), place_types: ['Nhà hàng hải sản'] },
    ]
    const out = applyPlaceConstraints({ results: rows }, c, 'vi')
    expect((out.result as { results: Array<{ name: string }> }).results.map(r => r.name)).toEqual(['Bếp Mẹ Ỉn', 'Quán Ốc 79'])
    expect(venueTypeOf({ name: 'Ebisu District 1', place_types: ['Nhà hàng Nhật', 'Quán rượu'] })).toBe('drinking')
  })

  it('an unpriced row under a stated budget is marked so the model can never present it as within budget', () => {
    const c = detectPlaceConstraints('50-60k thôi', extractBudget('50-60k'), [], LUNCH)
    const out = applyPlaceConstraints({ results: [row('A'), row('B', '1-100.000 ₫')] }, c, 'vi')
    const rows = (out.result as { results: Array<Record<string, unknown>> }).results
    expect(rows.find(r => r.name === 'A')?._tappy_price_unconfirmed).toBe(true)
    expect(rows.find(r => r.name === 'B')?._tappy_price_unconfirmed).toBeUndefined()
    expect(out.note).toContain('_tappy_price_unconfirmed')
  })

  it('no constraint → the same object back, untouched', () => {
    const input = { results: T3_ROWS }
    expect(applyPlaceConstraints(input, { budgetMax: null, exclude: [], openNow: false }, 'vi').result).toBe(input)
    expect(applyPlaceConstraints({ results: [] }, { budgetMax: 60000, exclude: [], openNow: true }, 'vi').dropped).toEqual([])
  })

  it('an English UI gets an English note', () => {
    const c = detectPlaceConstraints('under 60k, no restaurants', { min: 0, max: 60000, type: 'under' }, [], LUNCH)
    const out = applyPlaceConstraints({ results: T3_ROWS }, c, 'en')
    expect(out.note).toContain('REMOVED BY THE SYSTEM')
  })
})
