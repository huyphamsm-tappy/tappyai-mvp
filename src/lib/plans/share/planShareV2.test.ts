import { describe, it, expect } from 'vitest'
import { toPlanShareSnapshot, readPlanShareSnapshot } from './planShare'
import type { TappyPlan } from '@/components/TripPlanCard'

// R22 (Android proposal 29/09): plan card v2 fields survive the share snapshot, validated; image = KEY, never a URL.
const base = { type: 'trip', title: 'Quy Nhơn 3 ngày', days: [{ label: 'Ngày 1', items: [{ name: 'Eo Gió' }] }] }

describe('plan share snapshot — v2 fields', () => {
  it('keeps the valid ones', () => {
    const snap = toPlanShareSnapshot({
      ...base, domain: 'travel', destination: 'Quy Nhơn, Bình Định', duration: '3 ngày · 2 đêm', tagline: 'Biển xanh, hải sản tươi',
      hero_image: 'du-lich-bien-1', budget_per_person: '2.500.000đ/người', highlights: [{ label: 'Eo Gió', image: 'diem-bien' }],
      days: [{ label: 'Ngày 1', title: 'Khám phá thành phố biển', items: [{ name: 'Eo Gió', image: 'diem-bien' }] }],
    } as unknown as TappyPlan)!
    expect(snap).toMatchObject({ domain: 'travel', destination: 'Quy Nhơn, Bình Định', duration: '3 ngày · 2 đêm', hero_image: 'du-lich-bien-1', highlights: [{ label: 'Eo Gió', image: 'diem-bien' }] })
    expect(snap.days[0]).toMatchObject({ title: 'Khám phá thành phố biển', items: [{ name: 'Eo Gió', image: 'diem-bien' }] })
    expect(readPlanShareSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap)
  })
  it('drops what is malformed: a URL as an image, an unknown domain, a link in the tagline', () => {
    const snap = toPlanShareSnapshot({ ...base, domain: 'music', hero_image: 'https://x.example/a.jpg', tagline: 'xem https://evil.example', highlights: [{ label: 'A', image: 'DIEM BIEN' }] } as unknown as TappyPlan)!
    expect(snap.domain).toBeUndefined()
    expect(snap.hero_image).toBeUndefined()
    expect(snap.tagline).toBeUndefined()
    expect(snap.highlights).toEqual([{ label: 'A' }])
  })
  it('a plan without v2 fields is unchanged', () => {
    expect(toPlanShareSnapshot(base as unknown as TappyPlan)).toEqual({ v: 1, type: 'trip', title: 'Quy Nhơn 3 ngày', days: [{ label: 'Ngày 1', items: [{ name: 'Eo Gió' }] }] })
  })
})
