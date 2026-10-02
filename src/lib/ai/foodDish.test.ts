import { describe, it, expect } from 'vitest'
import { detectDish, rowServesDish, DISHES } from './foodDish'
import { detectFoodConstraints, osmFilterFor, rowSatisfies } from './foodConstraints'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE DISH THE USER NAMED WAS BEING DROPPED AT QUERY CONSTRUCTION.
// "bún bò ở Quận 1" became a bare `amenity=restaurant` search, so the card led
// with Jaspas / Au Tresor / Crazy Buffalo. Live Overpass, measured 2026-09-09
// at (10.7756,106.7019) r=1500, returns SIX real bún bò restaurants for
// `["name"~"bún bò|bun bo",i]` — the data was always there.
// ─────────────────────────────────────────────────────────────────────────────

describe('dish detection', () => {
  it('recognises a dish written with diacritics', () => {
    expect(detectDish('bún bò ở Quận 1')?.label).toBe('bún bò')
  })

  it('recognises a dish typed without diacritics', () => {
    expect(detectDish('quan bun bo ngon')?.label).toBe('bún bò')
  })

  it('prefers the more specific dish over a shorter one', () => {
    expect(detectDish('bún thịt nướng')?.label).toBe('bún thịt nướng')
    expect(detectDish('bún chả Hà Nội')?.label).toBe('bún chả')
  })

  it('returns null for a query that names no dish', () => {
    expect(detectDish('quán ăn ngon ở Quận 1')).toBeNull()
    expect(detectDish('nhà hàng buffet')).toBeNull()
  })

  // 🚨 normalizeVN('phố') === normalizeVN('phở') === 'pho'. Matching the
  // stripped form would turn a walk down the old quarter into a noodle filter.
  it('does not mistake "phố" (street) for "phở" (the dish)', () => {
    expect(detectDish('quán ăn phố cổ')).toBeNull()
    expect(detectDish('phố đi bộ Nguyễn Huệ')).toBeNull()
    expect(detectDish('phở bò Hà Nội')?.label).toBe('phở')
  })

  it('does not mistake "chào"/"che" for "cháo"/"chè"', () => {
    expect(detectDish('chào bạn')).toBeNull()
    expect(detectDish('cháo lòng')?.label).toBe('cháo')
    expect(detectDish('chè khúc bạch')?.label).toBe('chè')
  })
})

describe('dish enforcement on a retrieved row', () => {
  const dish = detectDish('bún bò')!

  it('accepts a venue whose name states the dish, with or without diacritics', () => {
    expect(rowServesDish({ name: 'Bún Bò Huế Đông Ba' }, dish)).toBe(true)
    expect(rowServesDish({ name: 'Quán Bún Bò Gánh' }, dish)).toBe(true)
    expect(rowServesDish({ name: 'Bun Bo Hue Gia Hoi' }, dish)).toBe(true)
  })

  it('rejects the exact venues the broken query used to surface', () => {
    for (const name of ['Jaspas', 'Au Tresor', 'Crazy Buffalo', 'Nhà Hàng Riverside Saigon']) {
      expect(rowServesDish({ name }, dish)).toBe(false)
    }
  })

  it('accepts a cuisine tag that names the dish', () => {
    expect(rowServesDish({ name: 'Quán Số 7', cuisine: 'bun_bo' }, dish)).toBe(false)
    expect(rowServesDish({ name: 'Quán Số 7', cuisine: 'bún bò' }, dish)).toBe(true)
  })
})

describe('dish as a food constraint', () => {
  it('produces an Overpass name filter in the shape that actually matches', () => {
    // 🚨 NOT a character class: Overpass matches over UTF-8 BYTES, so `b[uú]n`
    // matches nothing. Full literal alternatives are the working form.
    expect(osmFilterFor(detectFoodConstraints('bún bò'))).toBe('["name"~"bún bò|bun bo",i]')
    expect(osmFilterFor(detectFoodConstraints('bún bò'))).not.toMatch(/\[u/)
  })

  it('puts the dish first so the unmet note names it before any qualifier', () => {
    expect(detectFoodConstraints('bún bò chay').map(c => c.kind)).toEqual(['dish', 'vegetarian'])
  })

  it('combines the dish filter with a diet filter', () => {
    expect(osmFilterFor(detectFoodConstraints('bún bò chay')))
      .toBe('["name"~"bún bò|bun bo",i]["diet:vegetarian"~"yes|only",i]')
  })

  it('reports satisfaction through the shared rowSatisfies boundary', () => {
    const c = detectFoodConstraints('bún bò')[0]
    expect(rowSatisfies({ name: 'Bún Bò Huế Gia Hội' }, c)).toBe(true)
    expect(rowSatisfies({ name: 'Crazy Buffalo' }, c)).toBe(false)
  })

  it('leaves queries with no dish exactly as they were', () => {
    expect(detectFoodConstraints('nhà hàng buffet').map(c => c.kind)).toEqual(['buffet'])
    expect(detectFoodConstraints('quán ăn ngon ở Quận 1')).toEqual([])
  })
})

describe('the dish table itself', () => {
  it('has no character class over Vietnamese vowels in any Overpass pattern', () => {
    // The byte-wise trap: `[uú]` can never match a 2-byte `ú`.
    for (const d of DISHES) expect(d.osm).not.toMatch(/\[[^\]]*[^\x00-\x7F]/)
  })

  it('spells every Overpass alternative in a form OSM actually uses', () => {
    for (const d of DISHES) {
      expect(d.osm.length).toBeGreaterThan(0)
      for (const alt of d.osm.split('|')) expect(alt.trim()).toBe(alt)
    }
  })
})
