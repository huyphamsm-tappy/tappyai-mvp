// @vitest-environment node
// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file -- escapes only.
// P0-2 (G2 package 1): carried facts and shopping prices come from the rows the server stored, with their provenance.
import { describe, it, expect } from 'vitest'
import { carriedFromStoredCandidates, storedStates, storedShoppingRecords, storedShoppingPickPrice, plainValue, sameVenueName } from './serverCarried'
import { cannedCarriedFact } from '../cannedReply'
import type { ChatSessionState } from './chatSessionState'

const state = (rows: Array<Record<string, unknown>>, at?: string): ChatSessionState => ({ v: 1, candidates: { args: { query: 'q' }, rows, ...(at ? { at } : {}) } })
const venue = (name: string) => ({ index: 1, name })

describe('carriedFromStoredCandidates', () => {
  it('reads the referenced venue from the stored rows, with source and time', () => {
    const s = state([{ name: 'Phở Hòa Pasteur', phone: '028 1111 2222', address: '260C Pasteur, Quận 3', opening_hours: 'Mo-Su 06:00-22:00', rating_value: 4.5, rating_count: 2000, distance_km: 1.1 }], '2026-10-16T07:05:00.000Z')
    const r = carriedFromStoredCandidates(s, [venue('Phở Hòa Pasteur')])
    expect(r.carried).toEqual([{ name: 'Phở Hòa Pasteur', rating: 4.5, reviewCount: 2000, distanceKm: 1.1, hours: 'Mo-Su 06:00-22:00', phone: '028 1111 2222', address: '260C Pasteur, Quận 3' }])
    expect(r.provenance).toEqual({ source: 'search_places', observedAt: '2026-10-16T07:05:00.000Z', verification: 'tool_verified' })
  })
  it('no state, no rows, or a venue the rows do not name -> nothing (never a fact from the client copy)', () => {
    expect(carriedFromStoredCandidates(null, [venue('A')])).toEqual({ carried: [], provenance: null })
    expect(carriedFromStoredCandidates(state([]), [venue('A')])).toEqual({ carried: [], provenance: null })
    expect(carriedFromStoredCandidates(state([{ name: 'Quán Khác' }]), [venue('Quán Giả Lập')])).toEqual({ carried: [], provenance: null })
  })
  it('a stored value with hidden characters or a link is restated clean', () => {
    const r = carriedFromStoredCandidates(state([{ name: 'Quán A', address: '1 L\u{200B}ê L\u{202E}ợi \u{E200}cite\u{E201} https://evil.example/x' }]), [venue('Quán A')])
    expect(r.carried[0].address).toBe('1 Lê Lợi')
  })
  it('a row stored without a time still has provenance, with observedAt null', () => {
    expect(carriedFromStoredCandidates(state([{ name: 'Quán A', phone: '0901' }]), [venue('Quán A')]).provenance).toEqual({ source: 'search_places', observedAt: null, verification: 'tool_verified' })
  })
})

describe('storedStates', () => {
  it('only hours / phone / address / distance stored on the row count; open_now and price are never answered from storage', () => {
    const c = [{ name: 'A', rating: null, reviewCount: null, distanceKm: 0.5, hours: '06:00-22:00', phone: null, address: '1 X' }]
    const v = venue('A')
    expect(['hours', 'phone', 'address', 'distance', 'open_now', 'price'].map(f => storedStates(c, v, f as never))).toEqual([true, false, true, true, false, false])
    expect(storedStates(c, venue('B'), 'hours')).toBe(false)
  })
})

describe('cannedCarriedFact with provenance', () => {
  it('names the search and its Vietnam time; English too; an unknown time says "earlier" without a time', () => {
    const c = [{ name: 'Quán A', rating: null, reviewCount: null, distanceKm: null, hours: null, phone: '028 1111 2222', address: null }]
    expect(cannedCarriedFact(['phone'], [venue('Quán A')], c, 'vi', { source: 'search_places', observedAt: '2026-10-16T07:05:00.000Z' }))
      .toBe('Số điện thoại của **Quán A**: **028 1111 2222**.\n\n(Theo kết quả tra cứu địa điểm lúc 14:05 ngày 16/10 — nên gọi xác nhận trước khi đi nhé.)')
    expect(cannedCarriedFact(['phone'], [venue('Quán A')], c, 'en', { source: 'search_places', observedAt: '2026-10-16T07:05:00.000Z' }))
      .toBe('**Quán A** — phone: **028 1111 2222**.\n\n(From the place search at 14:05 on 16/10 — worth a quick call before you go.)')
    expect(cannedCarriedFact(['phone'], [venue('Quán A')], c, 'vi', { source: 'search_places', observedAt: null }))
      .toContain('(Theo kết quả tra cứu địa điểm ở lượt trước')
  })
})

describe('stored shopping rows', () => {
  const s: ChatSessionState = { v: 1, products: { query: 'nồi chiên', rows: [{ title: 'Nồi chiên A 5L', price: '1.990.000 ₫', source: 'shop.example' }, { title: 'Nồi chiên B', price: 'liên hệ' }] } }
  it('records = rows with a parsable price', () => {
    expect(storedShoppingRecords(s)).toEqual([{ title: 'Nồi chiên A 5L', price: '1.990.000 ₫', source: 'shop.example' }])
    expect(storedShoppingRecords(null)).toEqual([])
  })
  it('the pick price only from a stored row that names the pick; otherwise null (never a guess)', () => {
    expect(storedShoppingPickPrice(s, 'Nồi chiên A 5L')).toEqual({ amount: 1990000, seller: 'shop.example' })
    expect(storedShoppingPickPrice(s, 'Nồi chiên Z')).toBeNull()
    expect(storedShoppingPickPrice(s, null)).toBeNull()
    expect(storedShoppingPickPrice(null, 'Nồi chiên A 5L')).toBeNull()
  })
})

describe('helpers', () => {
  it('sameVenueName: folded equality or containment of at least 4 characters', () => {
    expect(sameVenueName('Phở Hòa Pasteur', 'pho hoa pasteur')).toBe(true)
    expect(sameVenueName('Phở Hòa Pasteur - Q3', 'Phở Hòa Pasteur')).toBe(true)
    expect(sameVenueName('Ốc', 'Ốc Đào')).toBe(false)
    expect(sameVenueName('', 'x')).toBe(false)
  })
  it('plainValue: strings only, cleaned', () => {
    expect(plainValue(' 1 Lê Lợi ')).toBe('1 Lê Lợi')
    expect(plainValue('[x](https://evil.example)')).toBe('x')
    expect(plainValue(5)).toBeNull()
  })
})
