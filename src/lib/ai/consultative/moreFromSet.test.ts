import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { wantsMoreFromSet, reusablePlaceSearch } from './moreFromSet'

// A1(d) — "gợi ý thêm" re-runs the previous place search through the pre-search (cache-answered on
// a warm instance) with the venues already shown excluded by directive; never a second model step.

describe('wantsMoreFromSet', () => {
  it('recognises the ways users ask for more of the same set (accented or not)', () => {
    for (const t of ['gợi ý thêm', 'goi y them', 'chỗ khác', 'quán khác', 'còn quán nào khác không', 'thêm vài chỗ nữa', 'cho thêm 2 chỗ', 'more options', 'show me more', 'anything else?', 'lựa chọn khác']) {
      expect(wantsMoreFromSet(t), t).toBe(true)
    }
  })
  it('a new request is not "more" — a constraint, an area, a subject or a long message', () => {
    for (const t of ['quán khác ở Phú Nhuận có chỗ đậu xe', 'khách sạn Đà Nẵng có view biển', 'gợi ý thêm mấy quán ăn chay yên tĩnh gần công viên Tao Đàn cho nhóm 6 người tối nay', 'quán này mở mấy giờ?', 'dưới 100k/người']) {
      expect(wantsMoreFromSet(t), t).toBe(false)
    }
  })
})

describe('reusablePlaceSearch', () => {
  const row = { v: 1, placeSearch: { args: { query: 'quán ăn tối ngon', type: 'restaurant', location: 'Quận 1' }, shown: ['Béo Ơi Quán', 'Hàng Dương Quán'], at: '2026-09-20T01:00:00Z' } }
  it('returns the stored call and the shown names', () => {
    expect(reusablePlaceSearch(row, true)).toEqual({ args: { query: 'quán ăn tối ngon', type: 'restaurant', location: 'Quận 1' }, shown: ['Béo Ơi Quán', 'Hàng Dương Quán'], at: '2026-09-20T01:00:00Z' })
  })
  it('a task switch, a shopping-only row, or a malformed row ⇒ nothing to reuse', () => {
    expect(reusablePlaceSearch(row, false)).toBeNull()
    expect(reusablePlaceSearch({ v: 1, pick: { title: 'x' } }, true)).toBeNull()
    expect(reusablePlaceSearch({ v: 1, placeSearch: { args: { type: 'spa' } } }, true)).toBeNull()
    expect(reusablePlaceSearch(null, true)).toBeNull()
  })
  it('a call the model made without a type is replayed without one (same cache key, same rows)', () => {
    expect(reusablePlaceSearch({ v: 1, placeSearch: { args: { query: 'phở ngon' }, shown: [], at: '' } }, true)?.args).toEqual({ query: 'phở ngon' })
  })
  it('route.ts wires it: plan from the stored search on a "more" turn, the search args recorded in the wrapper, saved with the presented names', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toMatch(/priorPlaceSearch && wantsMoreFromSet\(lastText\)/)
    expect(route).toMatch(/presearchPlan = \{ toolName: 'search_places', args: priorPlaceSearch\.args, exact: true, reuse: \{ shown: priorPlaceSearch\.shown \} \}/)
    expect(route).toMatch(/lastPlaceSearch = \{ args: \{ query,/)
    expect(route).toMatch(/placeSearch: \{ \.\.\.lastPlaceSearch, shown: \[\.\.\.\(evidence\.presentedNames \?\? \[\]\)\]/)
    // The shopping "evidence missing" block is a shopping instruction; it no longer fires on place turns.
    expect(route).toMatch(/priorEvidenceMissing && needProfile\.domain === 'shopping' \? renderMissingEvidenceBlock\(\)/)
  })
})
