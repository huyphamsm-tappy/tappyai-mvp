// The shared plan's stop photos come from the same turn's place cards — by name, canonical
// photos only — and the plan image then opens on that photo as its background (owner 29/09).

import { describe, it, expect } from 'vitest'
import { withPlacePhotos, normalisePlaceName } from './planPhotos'
import { brochureOf, type PlanShareSnapshot } from './planShare'
import { planCardHeight, planHeroBottom } from '@/lib/share/planCard'

const PHOTO_A = 'https://lh3.googleusercontent.com/p/AF1Qip-a=s800'
const PHOTO_B = 'https://lh3.googleusercontent.com/p/AF1Qip-b=s800'

const plan = {
  title: 'Tối nay ở Quận 1',
  days: [{ label: 'Tối nay', items: [
    { name: 'Aniki Nhà Hàng Nhật Quận 1' },
    { name: 'Phố đi bộ Bùi Viện' },
    { name: 'The View Rooftop Bar', photo_url: PHOTO_B },
  ] }],
}

describe('withPlacePhotos', () => {
  it('fills a stop from the card that names it (case / diacritics insensitive), and keeps an existing photo', () => {
    const out = withPlacePhotos(plan, [
      { name: 'ANIKI nha hang nhat quan 1', image: PHOTO_A },
      { name: 'The View Rooftop Bar', image: PHOTO_A },
    ])
    expect(out.days[0].items[0].photo_url).toBe(PHOTO_A)
    expect(out.days[0].items[1].photo_url).toBeUndefined()
    expect(out.days[0].items[2].photo_url).toBe(PHOTO_B)
    // not mutated
    expect(plan.days[0].items[0]).not.toHaveProperty('photo_url')
  })

  it('containment either way, but never on a fragment shorter than 4 characters', () => {
    const out = withPlacePhotos(plan, [{ name: 'Bùi Viện', image: PHOTO_A }])
    expect(out.days[0].items[1].photo_url).toBe(PHOTO_A)
    const none = withPlacePhotos(plan, [{ name: 'Phố', image: PHOTO_A }])
    expect(none.days[0].items[1].photo_url).toBeUndefined()
  })

  it('🚨 only canonical place photos: any other host is ignored', () => {
    const out = withPlacePhotos(plan, [{ name: 'Phố đi bộ Bùi Viện', image: 'https://evil.example/stock.jpg' }])
    expect(out).toBe(plan)
  })

  it('no cards → the same plan object', () => {
    expect(withPlacePhotos(plan, undefined)).toBe(plan)
    expect(withPlacePhotos(plan, [])).toBe(plan)
  })

  it('normalises đ and spacing', () => {
    expect(normalisePlaceName('  Đà   Lạt ')).toBe('da lat')
  })
})

describe('plan image height follows the photo poster', () => {
  const snap = (photos: (string | undefined)[]): PlanShareSnapshot => ({
    v: 1, type: 'trip', title: 'T',
    days: [{ label: 'D', items: photos.map((p, i) => ({ name: `Stop ${i}`, ...(p ? { photo_url: p } : {}) })) }],
  } as unknown as PlanShareSnapshot)

  it('a photo makes the hero the background poster (taller); none keeps the text band', () => {
    expect(planHeroBottom(true)).toBeGreaterThan(planHeroBottom(false))
    const withPhoto = snap([PHOTO_A, undefined])
    const without = snap([undefined, undefined])
    expect(brochureOf(withPhoto).hero).toBe(PHOTO_A)
    expect(planCardHeight(withPhoto) - planCardHeight(without)).toBe(planHeroBottom(true) - planHeroBottom(false))
  })

  it('two or more distinct photos add the "Điểm nổi bật" grid', () => {
    const one = snap([PHOTO_A, undefined])
    const two = snap([PHOTO_A, PHOTO_B])
    expect(planCardHeight(two)).toBeGreaterThan(planCardHeight(one))
  })
})
