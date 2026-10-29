import { describe, it, expect } from 'vitest'
import { destinationOf, guardPlaceGeography, provinceOf } from './placeGeoGuard'

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

// 29/10 (localhost, "Hội An 2 ngày 1 đêm"): cards for Cầu Vàng, Ngũ Hành Sơn and Núi Thần Tài. Post-merger, Maps writes Hội An as
// "…, Hội An, Đà Nẵng"; an area of "Hội An, Đà Nẵng" resolved to the province and every Đà Nẵng row passed. Coordinates as Maps gave them.
describe('a destination inside a province is held by distance (29/10)', () => {
  const rows = {
    results: [
      { name: 'Chùa Cầu', address: 'Nguyễn Thị Minh Khai, Hội An, Đà Nẵng 564010, Việt Nam', lat: 15.8771, lng: 108.3262 },
      { name: 'Rừng Dừa Bảy Mẫu', address: 'Hamlet 3, ĐX18, Hội An Đông, Đà Nẵng 84510, Việt Nam', lat: 15.8799, lng: 108.3712 },
      { name: 'Ngũ Hành Sơn', address: '81 Huyền Trân Công Chúa, Hoà Hải, Ngũ Hành Sơn, Đà Nẵng 550000, Việt Nam', lat: 16.0035, lng: 108.2633 },
      { name: 'Cầu Vàng', address: 'XXVW+XJ, Hòa Vang, Đà Nẵng, Việt Nam', lat: 15.9951, lng: 107.9963 },
      { name: 'Công viên Suối khoáng nóng Núi Thần Tài', address: 'Thôn Phú Túc, Hòa Vang, Đà Nẵng 550000, Việt Nam', lat: 15.9686, lng: 108.0218 },
      { name: 'Quán không toạ độ', address: 'Trần Phú, Hội An, Đà Nẵng' },
    ],
  }
  const names = (area: string) => (guardPlaceGeography(rows, area).result as typeof rows).results.map(r => r.name)

  it('"Hội An, Đà Nẵng": the rows within 25 km of Hội An stay; Cầu Vàng (~37 km) and Núi Thần Tài (~34 km) go', () => {
    expect(names('Hội An, Đà Nẵng')).toEqual(['Chùa Cầu', 'Rừng Dừa Bảy Mẫu', 'Ngũ Hành Sơn', 'Quán không toạ độ'])
    expect(guardPlaceGeography(rows, 'Hội An, Đà Nẵng').dropped.map(d => d.reason)).toEqual(['too_far', 'too_far'])
    // "phố cổ Hội An" names Hội An alone (Quảng Nam by the old province table): the coordinates still decide, so Ngũ Hành Sơn (16 km,
    // its address reading "Đà Nẵng") is not dropped by a province name the merger made stale.
    expect(names('phố cổ Hội An')).toEqual(names('Hội An, Đà Nẵng'))
  })
  it('a row WITHOUT coordinates keeps the address rules (a different province still goes, a foreign address still goes)', () => {
    const noCoords = { results: [{ name: 'Chợ Đêm Mộc Châu', address: 'Tiểu khu 4, Mộc Châu, Sơn La' }, { name: 'The Nest', address: '110 Stewart St, Seattle, WA 98101' }, { name: 'Quán Hội An', address: 'Trần Phú, Hội An, Đà Nẵng' }] }
    expect((guardPlaceGeography(noCoords, 'Hội An, Đà Nẵng').result as typeof noCoords).results.map(r => r.name)).toEqual(['Quán Hội An'])
  })
  it('a centrally-run city keeps the province rule only: "Đà Nẵng" keeps every Đà Nẵng row, far suburbs included', () => {
    expect(names('Đà Nẵng')).toEqual(rows.results.map(r => r.name))
    expect(destinationOf('Đà Nẵng')).toBeNull()
    expect(destinationOf('Hà Nội')).toBeNull()
    expect(destinationOf('Quận 1, TP HCM')).toBeNull()
    expect(destinationOf('Huế')).toBeNull()
  })
  it('the destination is the place named FIRST; an area naming none applies no distance', () => {
    expect(destinationOf('Hội An, Đà Nẵng')?.coords).toEqual([15.8801, 108.338])
    expect(destinationOf('Đà Nẵng, Hội An')).toBeNull()
    expect(destinationOf('Nha Trang, Khánh Hòa')?.coords).toEqual([12.2388, 109.1967])
    expect(destinationOf('Mộc Châu')).toBeNull()
  })
})
