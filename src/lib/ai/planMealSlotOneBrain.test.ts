// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlanItems } from './planItemGuard'

// ── 01/11 (owner UAT, plan card "phèn"): no filler meal slot on the one-brain route ───────────────────────────────────────────────────────
//
// Measured 01/11 (Seoul 5 days): two stops read "Bữa ăn gần chỗ ở - Chọn một quán gần chỗ ở khi tới nơi; hỏi trước món có hợp với bạn không."
// The guard turned a meal into that plain slot when its venue was already used (the model named it twice) or when the model gave no name, and
// threw away the model's own words. On one brain the stop keeps what the model wrote (its name and its words, minus any figure), without the
// venue data (no address, place id, link, photo, price) so no second card or button points at it; a stop with neither name nor words is dropped.
// The other routes keep the plain slot.

const plan = (items: unknown[]) => `x [TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'Seoul', days: [{ label: 'Ngày 1', items }] })}[/TAPPY_PLAN]`
const items = (r: { text: string }) => JSON.parse(r.text.slice(r.text.indexOf('[TAPPY_PLAN]') + 12, r.text.indexOf('[/TAPPY_PLAN]'))).days[0].items
const POOL = [{ name: 'Myeongdong Dakhanmari Sijo Branch', address: '12 Myeongdong, Seoul', place_types: ['restaurant'] }]
const ONE_BRAIN = { destination: 'Seoul', keepSights: true, knownSightsUnlabelled: true, keepNamedVenues: true, topUpReturnDay: false }
const GENERIC = 'Chọn một quán gần chỗ ở khi tới nơi; hỏi trước món có hợp với bạn không.'
const VENUE = { time: '19:00', category: 'food', name: 'Myeongdong Dakhanmari Sijo Branch', description: 'Dakgalbi', place_id: 'p1', maps_link: 'https://x', price: '30.000₩' }

describe('one brain: a meal whose venue was already used', () => {
  const out = items(guardPlanItems(plan([VENUE, { ...VENUE, time: '12:00', description: 'Ăn lại món gà, ngồi ở tầng trên' }]), POOL, ONE_BRAIN))
  it('keeps the model\'s own name and words', () => {
    expect(out[1].name).toBe('Myeongdong Dakhanmari Sijo Branch')
    expect(out[1].description).toBe('Ăn lại món gà, ngồi ở tầng trên')
    expect(JSON.stringify(out)).not.toContain(GENERIC)
  })
  it('carries no venue data, so no second card or button points at it', () => {
    expect(out[1].category).toBe('rest')
    for (const f of ['address', 'place_id', 'maps_link', 'photo_url', 'booking_link']) expect(out[1][f], f).toBeUndefined()
    expect(out[1].price ?? '').toBe('')
  })
})

describe('one brain: a meal with no name', () => {
  it('is named by its time of day and keeps the model\'s words, without a figure', () => {
    const [m] = items(guardPlanItems(plan([{ time: '19:00', category: 'food', name: '', description: 'Ăn món Hàn gần khách sạn, khoảng 30.000₩ một người' }]), POOL, ONE_BRAIN))
    expect(m.name).toBe('Ăn tối gần chỗ ở')
    expect(m.description).toBe('Ăn món Hàn gần khách sạn')
  })
  it('with no words either is dropped, not filled with a generic line', () => {
    const out = items(guardPlanItems(plan([{ time: '19:00', category: 'food', name: '', description: '' }, VENUE]), POOL, ONE_BRAIN))
    expect(out.map((i: { name: string }) => i.name)).toEqual(['Myeongdong Dakhanmari Sijo Branch'])
  })
})

describe('other routes', () => {
  it('keep the plain slot as before', () => {
    const out = items(guardPlanItems(plan([VENUE, { ...VENUE, time: '12:00', description: 'Ăn lại' }]), POOL, { destination: 'Seoul', keepSights: true }))
    expect(out[1].name).toBe('Ăn trưa gần chỗ ở')
    expect(out[1].description).toBe(GENERIC)
  })
})
