import { describe, it, expect } from 'vitest'
import { routeConsult, routeOf, prep } from './consultRouter'
import { deriveShoppingConstraints, validateShoppingCandidates } from './shoppingConstraints'
import { extractBudget } from '../budget'
import type { Candidate } from './candidate'

// Owner UAT 2026-10-01 (iPhone Safari, SHA 3fce8b7) — the sentences Huy typed, verbatim. Each case fails when its fix is removed.
const one = (...texts: string[]) => {
  const msgs: Array<{ role: string; content: string }> = []
  texts.forEach((t, i) => { if (i) msgs.push({ role: 'assistant', content: 'Để mình chọn đúng cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[]}[/TAPPY_ASK]\n\nBạn chọn nhanh bên dưới hoặc gõ tự do nhé — trả lời một phần cũng được.' }); msgs.push({ role: 'user', content: t }) })
  return routeConsult(msgs, { hasGps: true, lang: 'vi' }).decision
}
const cand = (name: string, priceVnd = 100000): Candidate => ({ id: name, name, domain: 'shopping', attrs: { priceVnd }, link: 'https://shopee.vn/x', raw: { title: name } })

describe('(d) an accessory FOR a phone is the accessory, not the phone', () => {
  it('«Muốn mua kính cường lực cho iphone» asks about the glass, never «which iPhone»', () => {
    const d = one('Muốn mua kính cường lực cho iphone')
    expect(d.known.san_pham).toBe('kính cường lực')
    expect(d.ask!.lead).not.toMatch(/iPhone/)
    const qs = d.ask!.questions.map(q => q.q).join('|')
    expect(qs).not.toMatch(/Đời nào|Dung lượng|Bản nào/)
    expect(qs).toMatch(/iPhone nào|Loại kính/)
  })
  it('«iPhone 17 · Cường lực mà» keeps the glass and names the phone it must fit', () => {
    const d = one('Muốn mua kính cường lực cho iphone', 'iPhone 17 · Cường lực mà')
    expect(d.known).toMatchObject({ san_pham: 'kính cường lực', cho_may: '17' })
  })
  it('a phone listing is NOT a screen protector (the iPhone 12 card Huy saw); a glass listing stays', () => {
    const k = deriveShoppingConstraints([{ role: 'user', content: 'Muốn mua kính cường lực cho iphone' }, { role: 'user', content: 'iPhone 17 · Cường lực mà' }], extractBudget('iPhone 17 · Cường lực mà'))
    expect(k.accessoryWanted).toBe('screen_protector')
    const { kept, rejected } = validateShoppingCandidates([cand('Apple iPhone 12 64GB', 6800000), cand('iPhone 13 Pro 128GB', 9000000), cand('Kính cường lực iPhone 17 Pro Max full màn hình', 89000)], k)
    expect(kept.map(c => c.name)).toEqual(['Kính cường lực iPhone 17 Pro Max full màn hình'])
    expect(rejected.every(r => r.reason === 'type')).toBe(true)
  })
  it('only phones found → nothing kept (no card), the model is told the constraint is unmet', () => {
    const k = deriveShoppingConstraints([{ role: 'user', content: 'Muốn mua kính cường lực cho iphone' }], null)
    expect(validateShoppingCandidates([cand('Apple iPhone 12 64GB'), cand('iPhone 15 128GB Vàng')], k).kept).toEqual([])
  })
})

describe('(a) «Mùa này đi du lịch ở đâu» asks the KIND of destination first; a bare city in a card answer is the ORIGIN', () => {
  it('leads with the destination kind', () => {
    const d = one('Mùa này đi du lịch ở đâu')
    expect(d.turn).toBe('ask')
    expect(d.ask!.questions[0].id).toBe('style')
    expect(d.ask!.questions[0].options).toEqual(['Biển', 'Núi', 'Thành phố', 'Nước ngoài'])
  })
  it('«3N2Đ · TP.HCM · 2 người» → TP.HCM is where the trip starts, there is no destination yet', () => {
    expect(routeOf(prep('Mùa này đi du lịch ở đâu 3N2Đ · TP.HCM · 2 người'))).toEqual({ origin: 'TP.HCM', dest: null })
    const d = one('Mùa này đi du lịch ở đâu', '3N2Đ · TP.HCM · 2 người')
    expect(d.known.diem_den).toBeUndefined()
    expect(d.known.xuat_phat).toBe('TP.HCM')
  })
})

describe('(f) «bay từ HCM» is a flight request and asks where to', () => {
  for (const text of ['bay từ HCM', 'đi máy bay từ TP.HCM']) {
    it(text, () => {
      const d = one(text)
      expect(d.known.xuat_phat).toBe('TP.HCM')
      expect(d.ask!.questions[0]).toMatchObject({ id: 'dest', q: 'Bay đến đâu?' })
      expect(d.ask!.lead).toMatch(/chuyến bay/)
    })
  }
  it('a trip plan that merely mentions a plane stays a trip', () => {
    expect(one('lên kế hoạch du lịch Đà Nẵng 3 ngày đi máy bay từ TP.HCM').ask?.lead ?? '').not.toMatch(/chuyến bay/)
  })
})
