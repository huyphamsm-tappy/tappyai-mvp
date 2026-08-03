import { describe, it, expect } from 'vitest'
import {
  HEAVENLY_STEMS,
  EARTHLY_BRANCHES,
  ELEMENTS,
  NAP_AM,
  getAstrologyProfile,
} from './canChiEngine'
import { getCanChiByYear, getNguHanhByYear } from './canChiData'

/**
 * Golden vectors — the same list is asserted by the Android (`CanChiEngineTest.kt`) and
 * iOS (`CanChiDataTests.swift`) mirrors. Any change here must be made on all three platforms.
 */
const VECTORS: Array<{
  year: number
  heavenlyStem: string
  earthlyBranch: string
  canChi: string
  napAm: string
  element: string
}> = [
  { year: 1984, heavenlyStem: 'Giáp', earthlyBranch: 'Tý', canChi: 'Giáp Tý', napAm: 'Hải Trung Kim', element: 'Kim' },
  { year: 1985, heavenlyStem: 'Ất', earthlyBranch: 'Sửu', canChi: 'Ất Sửu', napAm: 'Hải Trung Kim', element: 'Kim' },
  { year: 1986, heavenlyStem: 'Bính', earthlyBranch: 'Dần', canChi: 'Bính Dần', napAm: 'Lư Trung Hỏa', element: 'Hỏa' },
  { year: 1990, heavenlyStem: 'Canh', earthlyBranch: 'Ngọ', canChi: 'Canh Ngọ', napAm: 'Lộ Bàng Thổ', element: 'Thổ' },
  { year: 2000, heavenlyStem: 'Canh', earthlyBranch: 'Thìn', canChi: 'Canh Thìn', napAm: 'Bạch Lạp Kim', element: 'Kim' },
  { year: 2020, heavenlyStem: 'Canh', earthlyBranch: 'Tý', canChi: 'Canh Tý', napAm: 'Bích Thượng Thổ', element: 'Thổ' },
  { year: 1924, heavenlyStem: 'Giáp', earthlyBranch: 'Tý', canChi: 'Giáp Tý', napAm: 'Hải Trung Kim', element: 'Kim' },
  { year: 2045, heavenlyStem: 'Ất', earthlyBranch: 'Sửu', canChi: 'Ất Sửu', napAm: 'Hải Trung Kim', element: 'Kim' },
]

describe('canChiEngine tables', () => {
  it('has 10 stems, 12 branches and 30 nạp âm entries', () => {
    expect(HEAVENLY_STEMS).toHaveLength(10)
    expect(EARTHLY_BRANCHES).toHaveLength(12)
    expect(NAP_AM).toHaveLength(30)
  })

  it('every nạp âm entry carries a valid element alongside its name (no parsing needed)', () => {
    for (const entry of NAP_AM) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(ELEMENTS).toContain(entry.element)
    }
  })

  // Locks the table's element SEQUENCE itself, so a future typo in one row (e.g. the wrong
  // element paired with a napAm name) is caught even though name+element already live together.
  it('the 30 nạp âm entries follow the canonical Kim/Hỏa/Mộc/Thổ/Thủy repeating element cycle', () => {
    const expectedCycle = ['Kim', 'Hỏa', 'Mộc', 'Thổ', 'Kim', 'Hỏa', 'Thủy', 'Thổ', 'Kim', 'Mộc', 'Thủy', 'Thổ', 'Hỏa', 'Mộc', 'Thủy', 'Kim', 'Hỏa', 'Mộc', 'Thổ', 'Kim', 'Hỏa', 'Thủy', 'Thổ', 'Kim', 'Mộc', 'Thủy', 'Thổ', 'Hỏa', 'Mộc', 'Thủy']
    expect(NAP_AM.map((e) => e.element)).toEqual(expectedCycle)
  })
})

describe('getAstrologyProfile golden vectors', () => {
  for (const v of VECTORS) {
    it(`${v.year} → ${v.canChi} | ${v.napAm} | ${v.element}`, () => {
      const r = getAstrologyProfile(v.year)
      expect(r.heavenlyStem).toBe(v.heavenlyStem)
      expect(r.earthlyBranch).toBe(v.earthlyBranch)
      expect(r.canChi).toBe(v.canChi)
      expect(r.napAm).toBe(v.napAm)
      expect(r.element).toBe(v.element)
    })
  }

  it('1985 is Ất Sửu / Hải Trung Kim / Kim (regression: last-digit rule returned Mộc)', () => {
    const r = getAstrologyProfile(1985)
    expect(r.heavenlyStem).toBe('Ất')
    expect(r.earthlyBranch).toBe('Sửu')
    expect(r.canChi).toBe('Ất Sửu')
    expect(r.napAm).toBe('Hải Trung Kim')
    expect(r.element).toBe('Kim')
  })
})

describe('getAstrologyProfile invariants', () => {
  it('repeats with a period of 60 years', () => {
    for (let year = 1900; year <= 2100; year++) {
      expect(getAstrologyProfile(year)).toEqual(getAstrologyProfile(year + 60))
    }
  })

  it('yields non-empty fields and a valid element for every year in a 60-year span', () => {
    for (let year = 1960; year < 2020; year++) {
      const r = getAstrologyProfile(year)
      expect(r.heavenlyStem).not.toBe('')
      expect(r.earthlyBranch).not.toBe('')
      expect(r.canChi).toBe(`${r.heavenlyStem} ${r.earthlyBranch}`)
      expect(r.napAm).not.toBe('')
      expect(ELEMENTS).toContain(r.element)
    }
  })

  it('covers all 60 stem/branch pairs and all 30 nạp âm across one cycle', () => {
    const pairs = new Set<string>()
    const napAms = new Set<string>()
    for (let year = 1984; year < 2044; year++) {
      const r = getAstrologyProfile(year)
      pairs.add(r.canChi)
      napAms.add(r.napAm)
    }
    expect(pairs.size).toBe(60)
    expect(napAms.size).toBe(30)
  })

  it('is total for years before AD 4 (no negative-modulo crash)', () => {
    const r = getAstrologyProfile(-1)
    expect(ELEMENTS).toContain(r.element)
    expect(r.canChi).toBe(getAstrologyProfile(59).canChi)
  })
})

describe('canChiData integration (existing call sites keep working)', () => {
  it('getNguHanhByYear now returns the nạp âm element', () => {
    for (const v of VECTORS) {
      expect(getNguHanhByYear(v.year)).toBe(v.element)
    }
  })

  it('the 12-branch zodiac list still agrees with the engine branch', () => {
    for (let year = 1960; year < 2020; year++) {
      expect(getCanChiByYear(year).nameVi).toBe(getAstrologyProfile(year).earthlyBranch)
    }
  })
})
