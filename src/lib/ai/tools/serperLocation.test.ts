import { describe, it, expect } from 'vitest'
import { normalizeSerperLocation, serperMapsQuery } from './serperLocation'

// ─────────────────────────────────────────────────────────────────────────────
// Serper `/maps` returns `priceLevel` CONSISTENTLY only for a query whose place
// string reads like a Google Maps query. Measured 2026-09-17 on the audit env,
// same `ll`, same venues, minutes apart:
//   "quán ăn ngon Quận 1 Ho Chi Minh"  → 18 / 20 rows with priceLevel
//   "quán ăn ngon Quận 1, TP HCM"      →  0 / 20
// The model writes the `location` argument freely ("Quận 1, TP HCM", "Q.1 TP.HCM",
// "Quận 1, Hồ Chí Minh"), so the string is normalised before it is joined to the
// query — the CITY part becomes the canonical English name the city table already
// carries, the district part is kept as written, commas go. Owner-approved
// (overnight 2026-09-17: "location-string normalization for Serper so priceLevel
// is returned consistently").
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
