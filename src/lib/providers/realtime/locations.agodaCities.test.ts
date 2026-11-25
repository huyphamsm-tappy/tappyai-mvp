// Agoda city ids for the whole of Vietnam, from Agoda's own Hotel Data File (14/11/2026), not from a hand-typed table of 15 names.
// Evidence: the feed's rows carry city, country code and city_id; the first 231,649 hotels hold 4,548 Vietnamese hotels in 209 name variants of ~140 cities, and every id of the old hand table
// (read from the public city pages on 30/10) is in it with the same value. The old table said "Quy Nhơn, Hải Phòng: no page found" because the slug guessed was wrong, not because Agoda refuses.
// The rules proved here: the hand table still wins, the generated table fills the rest, names are matched the way people write them (accents, "tp", parentheses, a description stuck to the name),
// a name that could be two cities is never guessed, and a destination that is not in the table gets nothing (the provider is then answered by its own link, as before).
import { describe, it, expect } from 'vitest'
import { verifiedRefsFor, agodaCityIdFor, AGODA_VIETNAM_CITIES } from './locations'

const id = (dest: string) => verifiedRefsFor(dest)?.agoda?.cityRef

describe('the generated table', () => {
  it('is a real, bounded table with its provenance', () => {
    expect(AGODA_VIETNAM_CITIES.cities.length).toBeGreaterThan(60)
    expect(AGODA_VIETNAM_CITIES.cities.length).toBeLessThan(400)
    expect(AGODA_VIETNAM_CITIES.source).toMatch(/Hotel Data File/)
    for (const c of AGODA_VIETNAM_CITIES.cities) { expect(Number.isInteger(c.id)).toBe(true); expect(c.aliases.length).toBeGreaterThan(0) }
  })
  it('agrees with the hand-verified ids it replaces (the evidence that the feed is the same source)', () => {
    const hand: Array<[string, string]> = [['Đà Lạt', '15932'], ['Hà Nội', '2758'], ['Ho Chi Minh City', '13170'], ['Đà Nẵng', '16440'], ['Hội An', '16552'], ['Nha Trang', '2679'], ['Phú Quốc', '17188'],
      ['Huế', '3738'], ['Sapa', '17160'], ['Hạ Long', '17182'], ['Vũng Tàu', '17190'], ['Phan Thiết', '16264'], ['Cần Thơ', '16079'], ['Ninh Bình', '17245']]
    for (const [name, cityId] of hand) expect(agodaCityIdFor(name, { skipHand: true }), name).toBe(cityId)
  })
})

describe('what the old table missed', () => {
  it.each([['Quy Nhơn', '17242'], ['Quy Nhon', '17242'], ['Hải Phòng', '17161'], ['Hà Giang', '204060'], ['Cát Bà', '17243'], ['Phong Nha', '228387'], ['Buôn Ma Thuột', '19603'], ['Tam Đảo', '230398'], ['Mộc Châu', '226464']])('%s → %s', (name, cityId) => {
    expect(id(name)).toBe(cityId)
  })
})

describe('names the way people and the model write them', () => {
  it.each([
    ['quy nhơn gần biển', '17242'],
    ['Quy Nhơn, Bình Định', '17242'],
    ['Phú Quốc, gần biển, 4 người lớn, dưới 2.000.000 VND/đêm', '17188'],
    ['tp. hồ chí minh', '13170'],
    ['Sài Gòn', '13170'],
    ['Đà Lạt', '15932'],
    ['DA LAT', '15932'],
  ])('%s → %s', (name, cityId) => { expect(id(name)).toBe(cityId) })
})

describe('what is never guessed', () => {
  it.each(['', '   ', 'Atlantis', 'gần biển', 'khách sạn', 'a', 'Paris', 'vịnh biển đẹp', 'huế'.repeat(0) + 'hue hue hue'])('%j gets no id', (name) => { expect(id(name)).toBeUndefined() })
  it('a short city name only counts when it is the whole text: "vinh" is a city, "vịnh biển đẹp" is a bay', () => {
    expect(id('Vinh')).toBeDefined()
    expect(id('vịnh Hạ Long')).toBe('17182') // the longer name inside wins
  })
  it('a name shared by two cities in the feed is not resolved to either', () => {
    const owners = new Map<string, Set<number>>()
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '')
    for (const c of AGODA_VIETNAM_CITIES.cities) for (const a of c.aliases) { const k = fold(a); if (!owners.has(k)) owners.set(k, new Set()); owners.get(k)!.add(c.id) }
    for (const [k, s] of owners) expect(s.size, k).toBe(1)
  })
})

describe('the hand table still wins, and nothing else changes', () => {
  it('a hand-table city keeps its hand-table value', () => { expect(id('Đà Lạt')).toBe('15932') })
  it('the result has the shape the adapters already read', () => { expect(verifiedRefsFor('Quy Nhơn')).toEqual({ agoda: { cityRef: '17242' } }) })
  it('undefined in, undefined out', () => { expect(verifiedRefsFor(undefined)).toBeUndefined() })
})
