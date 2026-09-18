import { describe, it, expect } from 'vitest'
import { normalizeSerperLocation, serperMapsQuery } from './serperLocation'

// ─────────────────────────────────────────────────────────────────────────────
// The model writes the `location` argument freely ("Quận 1, TP HCM", "Q.1 TP.HCM",
// "Quận 1, Hồ Chí Minh"), so the string is normalised before it is joined to the
// query — the CITY part becomes the canonical English name the city table already
// carries, the district part is kept as written, commas go: one Maps-shaped string
// per (query, city), which the 30-minute place cache then hits across spellings.
// Owner-approved (overnight 2026-09-17). The `priceLevel` consistency itself is the
// single retry in serperPlaces.ts — the bands proved non-deterministic upstream for
// an IDENTICAL request (2026-09-18), so spelling was never the cause.
//
// Data acquisition is otherwise untouched: same endpoint, same `ll`, same rows.
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeSerperLocation', () => {
  it('rewrites a known city alias to its canonical Maps name and drops commas', () => {
    expect(normalizeSerperLocation('Quận 1, TP HCM')).toBe('Quận 1 Ho Chi Minh City')
    expect(normalizeSerperLocation('Quận 1, TP.HCM')).toBe('Quận 1 Ho Chi Minh City')
    expect(normalizeSerperLocation('Quận 1, Hồ Chí Minh')).toBe('Quận 1 Ho Chi Minh City')
    expect(normalizeSerperLocation('Quận 1 Ho Chi Minh')).toBe('Quận 1 Ho Chi Minh City')
    expect(normalizeSerperLocation('Sài Gòn')).toBe('Ho Chi Minh City')
    expect(normalizeSerperLocation('Hoàn Kiếm, Hà Nội')).toBe('Hoàn Kiếm Ha Noi')
    expect(normalizeSerperLocation('Sơn Trà, Đà Nẵng')).toBe('Sơn Trà Da Nang')
  })

  it('keeps an unknown place as written (commas removed), never invents a city', () => {
    expect(normalizeSerperLocation('Mũi Né')).toBe('Mũi Né')
    expect(normalizeSerperLocation('Bãi Dài, Cam Ranh')).toBe('Bãi Dài Cam Ranh')
  })

  it('every city in the shared table is rewritten to its Maps name', () => {
    expect(normalizeSerperLocation('Phú Quốc')).toBe('Phu Quoc')
    expect(normalizeSerperLocation('Bãi Sau, Vũng Tàu')).toBe('Bãi Sau Vung Tau')
    expect(normalizeSerperLocation('trung tâm Huế')).toBe('trung tâm Thua Thien Hue')
  })

  it('is stable: a canonical name normalises to itself', () => {
    const once = normalizeSerperLocation('Quận 1, TP HCM')
    expect(normalizeSerperLocation(once)).toBe(once)
  })

  it('collapses whitespace and handles empty input', () => {
    expect(normalizeSerperLocation('  Quận   3 ,  TPHCM ')).toBe('Quận 3 Ho Chi Minh City')
    expect(normalizeSerperLocation('')).toBe('')
    expect(normalizeSerperLocation(undefined)).toBe('')
  })
})

describe('serperMapsQuery', () => {
  it('joins the query and the normalised location; no location → the query alone', () => {
    expect(serperMapsQuery('quán ăn ngon', 'Quận 1, TP HCM')).toBe('quán ăn ngon Quận 1 Ho Chi Minh City')
    expect(serperMapsQuery('quán ăn ngon', undefined)).toBe('quán ăn ngon')
    expect(serperMapsQuery('quán ăn ngon', '')).toBe('quán ăn ngon')
  })
})
