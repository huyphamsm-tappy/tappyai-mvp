import { describe, it, expect } from 'vitest'
import { pickArea, foodQuery, buildPickPrompt, parsePicks, cardsFrom, renderSuggestionText, type Candidate } from './suggestCards'

// Owner 20/11: the group's suggestion is THREE cards of REAL places (searched for the group's area and tastes), not a paragraph the model made up. The model only CHOOSES among the places found
// and says why each suits the group; every fact on a card (name, address, rating, links) comes from the place row.
const rows: Candidate[] = [
  { name: 'Lau Be Man', address: '1 Le Loi, Quan 1', rating: 4.6, maps_link: 'https://www.google.com/maps?q=1', photo_url: 'https://lh3.googleusercontent.com/p/a' },
  { name: 'Bun Bo 3 Thang', address: '2 Nguyen Hue, Quan 1', rating: 4.2, maps_link: 'javascript:alert(1)' },
  { name: 'Com Chay Hoa Sen', address: '3 Pasteur, Quan 3', rating: 4.8 },
  { name: 'Pizza 4P', address: '4 Dong Khoi, Quan 1', rating: 4.9, maps_link: 'https://www.google.com/maps?q=4' },
  { name: 'Quan Nuong X', address: '5 Hai Ba Trung, Quan 1', rating: 3.9 },
]
const members = [
  { name: 'Linh', area: 'Quan 1', food_preferences: 'lau, bun bo', dietary_restrictions: 'khong an hai san', budget: '100–200k' },
  { name: 'Bao', area: 'Quan 1', food_preferences: 'bun bo', dietary_restrictions: '', budget: 'Dưới 100k' },
  { name: 'Cuong', area: 'Binh Thanh', food_preferences: '', dietary_restrictions: 'chay', budget: '100–200k' },
]

describe('what to search for', () => {
  it('the area is the one most members gave (the first on a tie); the query is the tastes people shared, once each', () => {
    expect(pickArea(members)).toBe('Quan 1')
    expect(pickArea([{ area: 'A' }, { area: 'B' }])).toBe('A')
    expect(pickArea([])).toBe('')
    expect(foodQuery(members)).toBe('lau bun bo')
    expect(foodQuery([{ food_preferences: '' }])).toBe('')
  })
})

describe('the model chooses among the places found, it does not invent one', () => {
  it('the prompt lists the places by number, with the members, and asks for a JSON answer', () => {
    const p = buildPickPrompt('Bua toi thu 6', ['- Linh: thich lau'], rows)
    expect(p).toContain('1. Lau Be Man')
    expect(p).toContain('5. Quan Nuong X')
    expect(p).toContain('Bua toi thu 6')
    expect(p).toContain('- Linh: thich lau')
    expect(p).toMatch(/JSON/)
  })
  it('picks are read from JSON anywhere in the text; unknown numbers, repeats and extras are dropped; at most three', () => {
    const text = 'Day la ket qua:\n```json\n[{"n":3,"why":"Co mon chay"},{"n":3,"why":"lap"},{"n":9,"why":"khong co"},{"n":1,"why":"Co lau"},{"n":2,"why":"Bun bo"},{"n":4,"why":"Pizza"}]\n```'
    expect(parsePicks(text, rows.length)).toEqual([{ index: 2, why: 'Co mon chay' }, { index: 0, why: 'Co lau' }, { index: 1, why: 'Bun bo' }])
  })
  it('text that is not JSON, or an empty list, gives no picks (the cards then fall back to the best rated)', () => {
    expect(parsePicks('khong biet', 5)).toEqual([])
    expect(parsePicks('[]', 5)).toEqual([])
    expect(parsePicks('[{"n":"x"}]', 5)).toEqual([])
  })
})

describe('the cards', () => {
  it('a card is a place row: name, address, rating, links; only https links survive; the id is its position', () => {
    const cards = cardsFrom(rows, [{ index: 0, why: 'Co lau' }, { index: 1, why: 'Bun bo' }, { index: 2, why: 'Chay' }], 'Quan 1')
    expect(cards.map(c => c.id)).toEqual(['1', '2', '3'])
    expect(cards[0]).toMatchObject({ name: 'Lau Be Man', address: '1 Le Loi, Quan 1', rating: 4.6, why: 'Co lau', maps_link: 'https://www.google.com/maps?q=1', photo_url: 'https://lh3.googleusercontent.com/p/a' })
    expect(cards[1].maps_link).toBeUndefined() // javascript: is not a link
  })
  it('with fewer than three picks the rest are filled with the best rated places not yet chosen, each with a factual reason', () => {
    const cards = cardsFrom(rows, [{ index: 4, why: 'Nuong' }], 'Quan 1')
    expect(cards).toHaveLength(3)
    expect(cards.map(c => c.name)).toEqual(['Quan Nuong X', 'Pizza 4P', 'Com Chay Hoa Sen'])
    expect(cards[1].why).toContain('4.9')
  })
  it('fewer places than three gives fewer cards; no places gives none; text is cleaned and clipped', () => {
    expect(cardsFrom(rows.slice(0, 2), [], 'Quan 1')).toHaveLength(2)
    expect(cardsFrom([], [], 'Quan 1')).toEqual([])
    const long = cardsFrom([{ name: 'N'.repeat(300), address: 'A'.repeat(300) }], [{ index: 0, why: 'W'.repeat(500) }], 'x')[0]
    expect(long.name.length).toBeLessThanOrEqual(80)
    expect(long.address!.length).toBeLessThanOrEqual(120)
    expect(long.why.length).toBeLessThanOrEqual(200)
  })
  it('the text version (what the mobile apps show) lists the same places in order', () => {
    const cards = cardsFrom(rows, [{ index: 0, why: 'Co lau' }], 'Quan 1')
    const t = renderSuggestionText(cards)
    expect(t.indexOf('Lau Be Man')).toBeGreaterThan(-1)
    expect(t.indexOf('Lau Be Man')).toBeLessThan(t.indexOf(cards[1].name))
    expect(t).toContain('Co lau')
    expect(t).toContain('1 Le Loi')
  })
})
