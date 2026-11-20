import { describe, it, expect } from 'vitest'
import { splitBill, type SplitInput } from './splitBill'

// Owner 20/11: equal split by default, editable by hand; "nếu có ghi chú thêm mục" - personal items (someone had a drink) are added to that person's share, the rest is shared equally.
// The money is in whole dong; the shares always add up to the bill (total + tip) exactly.
const P = [{ id: 'a', name: 'An' }, { id: 'b', name: 'Binh' }, { id: 'c', name: 'Chi' }, { id: 'd', name: 'Dung' }]
const base = (over: Partial<SplitInput> = {}): SplitInput => ({ participants: P, payerId: 'a', totalVnd: 400_000, tipVnd: 0, items: [], excluded: [], ...over })
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

describe('equal split', () => {
  it('four people, 400k: 100k each, the three others owe the payer 100k', () => {
    const r = splitBill(base())
    if (!r.ok) throw new Error(r.error)
    expect(r.shares.map(s => s.dueVnd)).toEqual([100_000, 100_000, 100_000, 100_000])
    expect(r.transfers).toEqual([{ fromId: 'b', toId: 'a', amountVnd: 100_000 }, { fromId: 'c', toId: 'a', amountVnd: 100_000 }, { fromId: 'd', toId: 'a', amountVnd: 100_000 }])
  })
  it('the tip is shared too', () => {
    const r = splitBill(base({ tipVnd: 40_000 }))
    if (!r.ok) throw new Error(r.error)
    expect(r.shares.map(s => s.dueVnd)).toEqual([110_000, 110_000, 110_000, 110_000])
  })
  it('the rounding dong land on the payer, so the others owe whole round shares and everything adds up exactly', () => {
    const r = splitBill(base({ totalVnd: 100_000 }))
    if (!r.ok) throw new Error(r.error)
    expect(r.shares.map(s => s.dueVnd)).toEqual([25_000, 25_000, 25_000, 25_000])
    const odd = splitBill(base({ totalVnd: 100_001 }))
    if (!odd.ok) throw new Error(odd.error)
    expect(sum(odd.shares.map(s => s.dueVnd))).toBe(100_001)
    expect(odd.shares[0].dueVnd).toBe(25_001) // the payer, who fronted the money, takes the extra dong
    expect(odd.transfers.every(t => t.amountVnd === 25_000)).toBe(true)
  })
  it('someone who did not eat is left out of the split (excluded) and owes nothing', () => {
    const r = splitBill(base({ totalVnd: 300_000, excluded: ['d'] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.shares.find(s => s.id === 'd')!.dueVnd).toBe(0)
    expect(r.transfers.map(t => [t.fromId, t.amountVnd])).toEqual([['b', 100_000], ['c', 100_000]])
  })
})

describe('personal items', () => {
  it('an item for one person is charged to that person only; the rest is shared equally', () => {
    // 400k total: Binh had a 60k beer; 340k is shared by 4 = 85k each; Binh owes 85k + 60k
    const r = splitBill(base({ items: [{ name: 'Bia', amountVnd: 60_000, forId: 'b' }] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.sharedVnd).toBe(340_000)
    expect(r.shares.map(s => [s.id, s.personalVnd, s.dueVnd])).toEqual([['a', 0, 85_000], ['b', 60_000, 145_000], ['c', 0, 85_000], ['d', 0, 85_000]])
    expect(sum(r.shares.map(s => s.dueVnd))).toBe(400_000)
  })
  it('a person who is excluded from the shared part can still carry a personal item', () => {
    const r = splitBill(base({ totalVnd: 300_000, excluded: ['d'], items: [{ name: 'Nuoc', amountVnd: 30_000, forId: 'd' }] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.shares.find(s => s.id === 'd')!.dueVnd).toBe(30_000)
    expect(sum(r.shares.map(s => s.dueVnd))).toBe(300_000)
  })
  it('the payer can have a personal item too (it just lowers what the others share)', () => {
    const r = splitBill(base({ items: [{ name: 'Ruou', amountVnd: 100_000, forId: 'a' }] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.shares.find(s => s.id === 'a')!.dueVnd).toBe(175_000)
    expect(r.transfers.map(t => t.amountVnd)).toEqual([75_000, 75_000, 75_000])
  })
})

describe('what is refused', () => {
  const err = (o: Partial<SplitInput>) => { const r = splitBill(base(o)); return r.ok ? null : r.error }
  it('personal items worth more than the bill, a bad total or tip, an unknown payer, nobody to share with', () => {
    expect(err({ items: [{ name: 'x', amountVnd: 500_000, forId: 'b' }] })).toBe('items_exceed_bill')
    expect(err({ totalVnd: 0 })).toBe('invalid_amount')
    expect(err({ totalVnd: 1.5 })).toBe('invalid_amount')
    expect(err({ totalVnd: 2_000_000_000 })).toBe('invalid_amount')
    expect(err({ tipVnd: -1 })).toBe('invalid_amount')
    expect(err({ payerId: 'zzz' })).toBe('unknown_person')
    expect(err({ excluded: ['a', 'b', 'c', 'd'] })).toBe('nobody_shares')
    expect(err({ items: [{ name: 'x', amountVnd: 1000, forId: 'zzz' }] })).toBe('unknown_person')
    expect(err({ items: [{ name: 'x', amountVnd: 0, forId: 'b' }] })).toBe('invalid_amount')
  })
  it('personal items that take the whole bill leave nothing to share (fine) as long as someone still shares', () => {
    const r = splitBill(base({ totalVnd: 100_000, items: [{ name: 'x', amountVnd: 100_000, forId: 'b' }] }))
    if (!r.ok) throw new Error(r.error)
    expect(r.sharedVnd).toBe(0)
    expect(r.shares.find(s => s.id === 'b')!.dueVnd).toBe(100_000)
  })
})
