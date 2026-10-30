import { describe, it, expect } from 'vitest'
import { createPlacesBudget } from './placesBudget'

// Review 30/10 (one brain): two different dishes in one city (restaurant + Đà Lạt) were one "intent"; the second search returned zero rows.
describe('placesBudget byQuery (one brain)', () => {
  it('different queries of the same type and city are different lookups, up to the limit', () => {
    const b = createPlacesBudget(3, { byQuery: true })
    expect(b.claim('restaurant', 'Đà Lạt', 'lẩu gà lá é')).toEqual({ allowed: true })
    expect(b.claim('restaurant', 'Đà Lạt', 'bánh căn')).toEqual({ allowed: true })
    expect(b.claim('restaurant', 'Da Lat', 'lau ga la e')).toEqual({ allowed: false, reason: 'intent_already_retrieved' })
    expect(b.claim('cafe', 'Đà Lạt', 'cà phê view đồi')).toEqual({ allowed: true })
    expect(b.claim('hotel', 'Đà Lạt', 'khách sạn trung tâm')).toEqual({ allowed: false, reason: 'budget_exhausted' })
  })
  it('without the option the key stays (type, location), as on every other route', () => {
    const b = createPlacesBudget(3)
    expect(b.claim('restaurant', 'Đà Lạt', 'lẩu gà lá é')).toEqual({ allowed: true })
    expect(b.claim('restaurant', 'Đà Lạt', 'bánh căn')).toEqual({ allowed: false, reason: 'intent_already_retrieved' })
  })
})
