// 20/11 (owner): the shared plan page carries the stays and the dishes of the plan, link-free except the booking page of a stay, short, and they read back the same.
import { describe, it, expect } from 'vitest'
import { toPlanShareSnapshot, readPlanShareSnapshot } from './planShare'
import type { TappyPlan } from '@/components/TripPlanCard'

const base = (extra: Record<string, unknown>) => ({ type: 'trip', title: 'Trip', days: [{ label: 'D1', items: [{ time: '09:00', emoji: 'x', category: 'food', name: 'Pho' }] }], ...extra }) as unknown as TappyPlan

describe('toPlanShareSnapshot: stays and dishes', () => {
  it('keeps at most 3 stays and 6 dishes; only an https booking page and a real price survive', () => {
    const stays = Array.from({ length: 5 }, (_, i) => ({ name: `Hotel ${i}`, why: `Why ${i}`, price: i === 0 ? '1.000.000d/dem' : 'chua co gia', booking_link: i === 0 ? 'https://www.agoda.com/p?x=1' : 'http://insecure.example/x' }))
    const dishes = Array.from({ length: 8 }, (_, i) => ({ dish: `Dish ${i}`, venue: `Venue ${i}`, note: i === 0 ? 'see https://x.test/y' : `Note ${i}` }))
    const s = toPlanShareSnapshot(base({ stays, dishes }))!
    expect(s.stays).toHaveLength(3)
    expect(s.stays![0]).toMatchObject({ name: 'Hotel 0', why: 'Why 0', price: '1.000.000d/dem', booking_link: 'https://www.agoda.com/p?x=1' })
    expect(s.stays![1].booking_link).toBeUndefined()
    expect(s.stays![1].price).toBeUndefined()
    expect(s.dishes).toHaveLength(6)
    expect(s.dishes![0].note).toBeUndefined() // a link in free text is not published
    expect(s.dishes![1]).toMatchObject({ dish: 'Dish 1', venue: 'Venue 1', note: 'Note 1' })
  })
  it('a plan with neither has neither field, and a stored snapshot reads back the same', () => {
    const none = toPlanShareSnapshot(base({}))!
    expect(none.stays).toBeUndefined()
    expect(none.dishes).toBeUndefined()
    const t = toPlanShareSnapshot(base({ stays: [{ name: 'Hotel A', why: 'Lake', booking_link: 'https://www.agoda.com/p?x=1' }], dishes: [{ dish: 'Bun cha', venue: 'Huong Lien', price: '60.000d' }] }))!
    expect(readPlanShareSnapshot(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })
})
