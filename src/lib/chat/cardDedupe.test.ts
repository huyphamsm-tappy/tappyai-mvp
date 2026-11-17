import { describe, it, expect } from 'vitest'
import { planItemNames, isListedAs, withoutListed, textHasTable, splitProfilesByPlaces } from './cardDedupe'

describe('splitProfilesByPlaces', () => {
  const places = [{ id: 'p1', name: 'Madame Lam - Nhà hàng món Việt' }, { id: 'p2', name: 'Upstairs Tasting Room' }]
  it('the points of a subject that is also a venue card go onto that card; the others stay subject cards', () => {
    const items = [
      { name: 'Madame Lam', points: [{ lead: 'Không gian', text: 'ấm cúng' }] },
      { name: 'Upstairs Tasting Room', points: [{ text: 'tasting menu' }] },
      { name: 'Một chỗ khác', points: [{ text: 'x' }] },
    ]
    const { notes, rest } = splitProfilesByPlaces(items, places)
    expect([...notes.keys()]).toEqual(['p1', 'p2'])
    expect(notes.get('p1')).toEqual([{ lead: 'Không gian', text: 'ấm cúng' }])
    expect(rest.map(r => r.name)).toEqual(['Một chỗ khác'])
  })
  it('the names of the sources travel with the points to the venue card', () => {
    const { noteSources } = splitProfilesByPlaces([{ name: 'Madame Lam', points: [{ text: 'a' }], sources: ['madamelam.com', 'Google Maps'] }, { name: 'Upstairs Tasting Room', points: [{ text: 'b' }] }], places)
    expect(noteSources.get('p1')).toEqual(['madamelam.com', 'Google Maps'])
    expect(noteSources.has('p2')).toBe(false)
  })
  it('a venue takes the points of one subject only, and no places means nothing is moved', () => {
    const twice = splitProfilesByPlaces([{ name: 'Upstairs Tasting Room', points: [{ text: 'a' }] }, { name: 'Upstairs Tasting Room', points: [{ text: 'b' }] }], places)
    expect(twice.notes.get('p2')).toEqual([{ text: 'a' }])
    expect(twice.rest).toHaveLength(1)
    const none = splitProfilesByPlaces([{ name: 'Madame Lam', points: [{ text: 'a' }] }], [])
    expect(none.notes.size).toBe(0)
    expect(none.rest).toHaveLength(1)
  })
})

describe('textHasTable', () => {
  it('a markdown table in the text is seen (with or without outer pipes, aligned columns); a rule, a quote or plain pipes are not a table', () => {
    expect(textHasTable('Mở đầu.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n')).toBe(true)
    expect(textHasTable('A | B\n:--- | ---:\n1 | 2')).toBe(true)
    expect(textHasTable('Mở đầu.\n\n---\n\nKết thúc.')).toBe(false)
    expect(textHasTable('> a quote | with a pipe\n\nplain text | with a pipe')).toBe(false)
    expect(textHasTable('')).toBe(false)
    expect(textHasTable(undefined)).toBe(false)
  })
})

const plan = { days: [{ items: [{ name: 'Bánh canh hẹ chả cá cá dầm' }, { name: 'Khách sạn Haku Boutique Tuy Hòa - APEC Mandala' }, { name: ' ' }] }, { items: [{ name: 'Bãi Xép' }, { name: 'Đầm Ô Loan' }] }] }

describe('planItemNames', () => {
  it('every stop of every day, empty names left out; no plan, no names', () => {
    expect(planItemNames(plan)).toEqual(['Bánh canh hẹ chả cá cá dầm', 'Khách sạn Haku Boutique Tuy Hòa - APEC Mandala', 'Bãi Xép', 'Đầm Ô Loan'])
    expect(planItemNames(null)).toEqual([])
    expect(planItemNames({ days: [] })).toEqual([])
  })
})

describe('isListedAs: the same subject by name, in either direction', () => {
  const listed = planItemNames(plan)
  it('the card of a stop is the stop; accents and case do not matter; a shorter or longer name of the same place counts', () => {
    expect(isListedAs('Bãi Xép', listed)).toBe(true)
    expect(isListedAs('bai xep', listed)).toBe(true)
    expect(isListedAs('Haku Boutique Tuy Hòa', listed)).toBe(true)
    expect(isListedAs('Khách sạn Haku Boutique Tuy Hòa - APEC Mandala, Tuy Hòa', listed)).toBe(true)
  })
  it('another place is not listed, even when they share one common word', () => {
    expect(isListedAs('Mũi chắn sóng Sông Đà Rằng', listed)).toBe(false)
    expect(isListedAs('Bãi Môn', listed)).toBe(false)
    expect(isListedAs('Quán Bà Tám', listed)).toBe(false)
  })
})

describe('withoutListed', () => {
  it('keeps what the plan does not name, in order; nothing listed = the same items', () => {
    const cards = [{ name: 'Bãi Xép', id: 1 }, { name: 'Mũi chắn sóng Sông Đà Rằng', id: 2 }, { name: 'Đầm Ô Loan', id: 3 }]
    expect(withoutListed(cards, planItemNames(plan)).map(c => c.id)).toEqual([2])
    expect(withoutListed(cards, []).map(c => c.id)).toEqual([1, 2, 3])
  })
  it('three restaurants that the places already show: the option cards of the same three vanish, a fourth stays', () => {
    const places = ['Cục Gạch Quán', 'Maison Mận-Đỏ', 'Secret Garden']
    const options = [{ name: 'Cục Gạch Quán' }, { name: 'Nhà Hàng Maison Mận-Đỏ' }, { name: 'Secret Garden' }, { name: 'Quán Bụi' }]
    expect(withoutListed(options, places).map(o => o.name)).toEqual(['Quán Bụi'])
  })
})
