import { describe, it, expect } from 'vitest'
import { guardPlaceGeography, provinceOf } from './placeGeoGuard'

// R13 (P0): the rows the Android e2e got for a Đà Nẵng plan (UAT 29/09 01:30).
const r13 = {
  count: 4,
  results: [
    { name: 'Saigon | Vietnamese Cuisine', address: '12100 W Center Rd, Omaha, NE 68144, United States' },
    { name: 'Chợ Đêm Mộc Châu', address: 'Tiểu khu 4, Mộc Châu, Sơn La' },
    { name: 'The Nest', address: '110 Stewart St, Seattle, WA 98101' },
    { name: 'Bé Mặn', address: 'Lô 11 Võ Nguyên Giáp, Phước Mỹ, Sơn Trà, Đà Nẵng 550000, Việt Nam' },
  ],
}

describe('guardPlaceGeography', () => {
  it('drops the foreign rows and the other-province row for a Đà Nẵng search', () => {
    const out = guardPlaceGeography(r13, 'Đà Nẵng')
    const rows = (out.result as typeof r13).results
    expect(rows.map(r => r.name)).toEqual(['Bé Mặn'])
    expect(out.dropped.map(d => d.reason).sort()).toEqual(['foreign', 'foreign', 'other_city'])
  })
  it('with no area, drops only rows outside Việt Nam', () => {
    const rows = (guardPlaceGeography(r13, null).result as typeof r13).results
    expect(rows.map(r => r.name)).toEqual(['Chợ Đêm Mộc Châu', 'Bé Mặn'])
  })
  it('keeps rows with no address, and returns the same object when nothing is dropped', () => {
    const ok = { results: [{ name: 'A', address: '' }, { name: 'B', address: '12 Lê Lợi, Quận 1, TP. Hồ Chí Minh' }] }
    expect(guardPlaceGeography(ok, 'Quận 1 Hồ Chí Minh').result).toBe(ok)
  })
  it('reads short and unaccented city names', () => {
    expect(provinceOf('sai gon')).toBe('ho chi minh')
    expect(provinceOf('TP.HCM')).toBe('ho chi minh')
    expect(provinceOf('Hội An')).toBe('quang nam')
    expect(provinceOf('Vịnh Hạ Long')).toBe('quang ninh')
    expect(provinceOf('quán ăn ngon')).toBeNull()
  })
})

describe('street names that are province names (Explore clip regression)', () => {
  it('never reads the street segment', () => {
    expect(provinceOf('155 Nguyễn Thái Bình, Quận 1, TP.HCM')).toBe('ho chi minh')
    expect(provinceOf('123 Nguyễn Huệ, Quận 1, TP.HCM')).toBe('ho chi minh')
    const rows = { results: [{ name: 'A', address: '32 Nguyễn Thái Bình, Quận 1, TP.HCM' }, { name: 'B', address: '110A Nguyễn Du, Quận 1, TP.HCM' }] }
    expect(guardPlaceGeography(rows, '155 Nguyễn Thái Bình, Quận 1, TP.HCM').dropped).toEqual([])
  })
})

describe('district-only area: the province comes from GPS', () => {
  it('holds a "quận 1" search in TP.HCM to TP.HCM rows', async () => {
    const { geoGuardArea, provinceNear } = await import('./placeGeoGuard')
    expect(provinceNear(10.7769, 106.7009)).toBe('ho chi minh')
    expect(provinceNear(0, 0)).toBeNull()
    const area = geoGuardArea('quận 1', { lat: 10.7769, lng: 106.7009 })
    const rows = { results: [{ name: 'Izakaya Taka Hue', address: '12 Võ Thị Sáu, Vĩnh Ninh, Huế' }, { name: 'Aniki', address: '112 Trần Khắc Chân, Quận 1, TP.HCM' }] }
    expect((guardPlaceGeography(rows, area).result as typeof rows).results.map(r => r.name)).toEqual(['Aniki'])
    expect(geoGuardArea('Đà Nẵng', { lat: 10.7769, lng: 106.7009 })).toBe('Đà Nẵng')
  })
})
