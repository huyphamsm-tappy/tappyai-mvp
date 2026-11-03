import { describe, it, expect } from 'vitest'
import { placeQueryFit } from './placeQueryFit'

// 03/11 (owner's conversation, turn 6): "hủ tiếu xương ở Phan Đình Phùng" - the first row was a place known for DRY noodles; the answer picked it
// and only said so in passing. What the person named (a dish, a thing) is one thing a row's own name can confirm or not, so the tool says, per row,
// which of the named terms the row shows. It is a signal, never a filter: a name does not list a menu.
const rows = [{ name: 'Tài 61 Hủ tiếu khô sa tế Mì sủi cảo' }, { name: 'Quán mì hủ tiếu Quốc Xương' }, { name: 'Hủ Tiếu Nam Vang Chị Tư Phú Nhuận' }]

describe('placeQueryFit', () => {
  it('names, per row, the specific terms of the query that the row name shows and misses (accent-insensitive)', () => {
    const fit = placeQueryFit('hủ tiếu xương', rows)
    expect(fit.terms).toEqual(['hu', 'tieu', 'xuong'])
    expect(fit.rows[0]).toMatchObject({ name: 'Tài 61 Hủ tiếu khô sa tế Mì sủi cảo', shows: ['hu', 'tieu'], missing: ['xuong'] })
    expect(fit.rows[1]).toMatchObject({ shows: ['hu', 'tieu', 'xuong'], missing: [] })
  })
  it('lists the rows whose name shows every specific term', () => {
    expect(placeQueryFit('hủ tiếu xương', rows).fullMatches).toEqual(['Quán mì hủ tiếu Quốc Xương'])
  })
  it('says so when no row name shows every term', () => {
    const fit = placeQueryFit('hủ tiếu xương', [rows[0], rows[2]])
    expect(fit.fullMatches).toEqual([])
    expect(fit.note).toMatch(/no row name shows all of/i)
  })
  it('ignores words that do not name a thing: generic place words, politeness, prepositions', () => {
    expect(placeQueryFit('quán ăn ngon gần đây', rows).terms).toEqual([])
    expect(placeQueryFit('quán cà phê yên tĩnh có wifi ở Quận 3', rows).terms).toEqual(['ca', 'phe', 'yen', 'tinh', 'wifi'])
  })
  it('a query with no specific term says nothing', () => {
    const fit = placeQueryFit('quán ăn gần đây', rows)
    expect(fit.note).toBeNull()
    expect(fit.fullMatches).toEqual([])
  })
  it('rows without a name are skipped, no throw', () => {
    expect(() => placeQueryFit('phở bò', [{}, { name: 5 as never }, { name: 'Phở Bò Hòa' }])).not.toThrow()
  })
})
