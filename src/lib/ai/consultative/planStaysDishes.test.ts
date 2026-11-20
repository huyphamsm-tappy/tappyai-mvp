import { describe, it, expect } from 'vitest'
import { withStaysAndDishes } from './planStaysDishes'

const base = (extra: Record<string, unknown>) => JSON.stringify({ type: 'trip', title: 'T', days: [{ label: 'D1', items: [{ name: 'x' }] }], ...extra })
const ctx = {
  stays: [
    { name: 'Pu Luong Eco Garden', url: 'https://www.agoda.com/partners/x?hid=1', perNight: 1_250_000 },
    { name: 'Other Hotel', url: 'https://www.agoda.com/partners/x?hid=2' },
  ],
  places: [
    { name: 'Quan Bun Cha Huong Lien', address: '24 Le Van Huu, Hanoi' },
    { name: 'Pho Gia Truyen', address: '49 Bat Dan, Hanoi' },
  ],
}
const parse = (json: string) => JSON.parse(json) as { stays?: Array<Record<string, unknown>>; dishes?: Array<Record<string, unknown>> }

describe('withStaysAndDishes: stays', () => {
  it('a stay named by the lookup gets the Agoda page and the price per night from the lookup, never from the model', () => {
    const out = parse(withStaysAndDishes(base({ stays: [{ name: 'Pu Luong Eco Garden', why: 'Gan ruong bac thang', price: '99.000d', booking_link: 'https://evil.example/x' }] }), ctx))
    expect(out.stays).toHaveLength(1)
    expect(out.stays![0].booking_link).toBe('https://www.agoda.com/partners/x?hid=1')
    expect(out.stays![0].price).toBe('1.250.000đ/đêm')
    expect(out.stays![0].why).toBe('Gan ruong bac thang')
  })
  it('a hotel no lookup returned is dropped (never a made-up hotel), and at most three stays are kept', () => {
    const many = ['Pu Luong Eco Garden', 'Other Hotel', 'Pho Gia Truyen', 'Khach San Khong Co'].map(name => ({ name, why: 'w' }))
    const out = parse(withStaysAndDishes(base({ stays: many }), ctx))
    expect(out.stays!.map(s => s.name)).toEqual(['Pu Luong Eco Garden', 'Other Hotel', 'Pho Gia Truyen'])
    const none = parse(withStaysAndDishes(base({ stays: [{ name: 'Khach San Khong Co' }] }), ctx))
    expect(none.stays).toBeUndefined()
  })
  it('a stay with no price in the lookup shows no price, and a link in the free text drops that text', () => {
    const out = parse(withStaysAndDishes(base({ stays: [{ name: 'Other Hotel', why: 'xem https://spam.example' }] }), ctx))
    expect(out.stays![0].price).toBeUndefined()
    expect(out.stays![0].why).toBeUndefined()
  })
})

describe('withStaysAndDishes: dishes', () => {
  it('a dish whose venue is a searched place keeps the venue, its address from the place and the price', () => {
    const out = parse(withStaysAndDishes(base({ dishes: [{ dish: 'Bun cha', venue: 'Quan Bun Cha Huong Lien', price: '60.000d', note: 'Nem cua be' }] }), ctx))
    expect(out.dishes![0]).toMatchObject({ dish: 'Bun cha', venue: 'Quan Bun Cha Huong Lien', address: '24 Le Van Huu, Hanoi', price: '60.000d', note: 'Nem cua be' })
  })
  it('a venue that was not searched is not named and carries no price or address, but the dish stays', () => {
    const out = parse(withStaysAndDishes(base({ dishes: [{ dish: 'Cha ca', venue: 'Quan Bia Ma', price: '80.000d', address: 'Somewhere' }] }), ctx))
    expect(out.dishes).toEqual([{ dish: 'Cha ca' }])
  })
  it('keeps at most six dishes, drops nameless ones, and removes the keys when nothing is left', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ dish: `Mon ${i}` }))
    expect(parse(withStaysAndDishes(base({ dishes: seven }), ctx)).dishes).toHaveLength(6)
    const out = parse(withStaysAndDishes(base({ dishes: [{ venue: 'Pho Gia Truyen' }], stays: [] }), ctx))
    expect('dishes' in out).toBe(false)
    expect('stays' in out).toBe(false)
  })
  it('a price with no digit is not shown', () => {
    const out = parse(withStaysAndDishes(base({ dishes: [{ dish: 'Pho', venue: 'Pho Gia Truyen', price: 'chua co gia' }] }), ctx))
    expect(out.dishes![0].price).toBeUndefined()
  })
})

describe('withStaysAndDishes: safety', () => {
  it('bad JSON and a plan with neither field come back as they were', () => {
    expect(withStaysAndDishes('not json', ctx)).toBe('not json')
    const plain = base({})
    expect(withStaysAndDishes(plain, ctx)).toBe(plain)
  })
})
