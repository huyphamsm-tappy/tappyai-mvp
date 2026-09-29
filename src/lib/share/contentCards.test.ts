// The card data of an Explore post (owner picks 29/09): only the post's own public fields, never
// the composer's "Chia sẻ" sentinel, never an invented rating. And the plan image's height is bounded.

import { describe, it, expect } from 'vitest'
import { postCardOf, POST_EXCERPT_MAX } from './contentCards'
import { planCardHeight, PLAN_CARD_DAYS, PLAN_CARD_STOPS } from './planCard'
import { cardImageSrc } from './cardStyle'
import type { PlanShareSnapshot } from '@/lib/plans/share/planShare'

const base = {
  place_name: 'Phở Hòa Pasteur', place_address: '260C Pasteur, Q3', rating: 5, body: 'Nước dùng đậm, thịt mềm.',
  photos: ['https://abc.supabase.co/storage/v1/object/public/p/1.jpg'], thumbnail: null, content_type: 'photo',
  profiles: { full_name: 'Minh An' },
}

describe('postCardOf', () => {
  it('a photo review → review card with place, address, rating, excerpt, author and its first photo', () => {
    expect(postCardOf(base)).toEqual({
      kind: 'review', title: 'Phở Hòa Pasteur', placeName: 'Phở Hòa Pasteur', address: '260C Pasteur, Q3', rating: 5,
      excerpt: 'Nước dùng đậm, thịt mềm.', author: 'Minh An', image: base.photos[0],
    })
  })

  it('a video → clip card, thumbnail first, and no star rating', () => {
    const c = postCardOf({ ...base, content_type: 'video', thumbnail: 'https://storage.googleapis.com/b/t.jpg' })
    expect(c.kind).toBe('clip')
    expect(c.image).toBe('https://storage.googleapis.com/b/t.jpg')
    expect(c.rating).toBeUndefined()
  })

  it('🚨 the "Chia sẻ" sentinel is never a place: no place, no address, no rating; the caption is the title, printed once', () => {
    const c = postCardOf({ ...base, place_name: 'Chia sẻ' })
    expect(c.placeName).toBeUndefined()
    expect(c.address).toBeUndefined()
    expect(c.rating).toBeUndefined()
    expect(c.title).toBe('Nước dùng đậm, thịt mềm.')
    expect(c.excerpt).toBeUndefined()
  })

  it('no invented fields: an out-of-range rating, a non-https photo and a missing author are simply absent', () => {
    const c = postCardOf({ ...base, rating: 0, photos: ['http://x/1.jpg'], profiles: null })
    expect(c.rating).toBeUndefined()
    expect(c.image).toBeUndefined()
    expect(c.author).toBeUndefined()
  })

  it('a long caption is cut with an ellipsis', () => {
    const c = postCardOf({ ...base, body: 'a '.repeat(400) })
    expect(c.excerpt!.length).toBeLessThanOrEqual(POST_EXCERPT_MAX)
    expect(c.excerpt!.endsWith('…')).toBe(true)
  })
})

describe('cardImageSrc — photos never taint the canvas', () => {
  it('optimiser hosts go through the same-origin /_next/image', () => {
    expect(cardImageSrc('https://lh3.googleusercontent.com/p/x=s1360')).toBe(`/_next/image?url=${encodeURIComponent('https://lh3.googleusercontent.com/p/x=s1360')}&w=1080&q=80`)
    expect(cardImageSrc('https://storage.googleapis.com/b/1.jpg', 384)).toContain('&w=384&')
  })
  it('same-origin paths pass, other https hosts are tried as-is (CORS-checked), anything else is dropped', () => {
    expect(cardImageSrc('/branding/otter-logo.png')).toBe('/branding/otter-logo.png')
    expect(cardImageSrc('https://i.ytimg.com/vi/x/hq.jpg')).toBe('https://i.ytimg.com/vi/x/hq.jpg')
    expect(cardImageSrc('http://x/1.jpg')).toBeNull()
    expect(cardImageSrc('//evil.example/x.png')).toBeNull()
    expect(cardImageSrc(undefined)).toBeNull()
  })
})

describe('planCardHeight', () => {
  const day = (n: number) => ({ label: `Ngày ${n}`, items: Array.from({ length: 6 }, (_, i) => ({ name: `Stop ${i}` })) })
  it('grows with the plan but is bounded by the drawn days/stops', () => {
    const small: PlanShareSnapshot = { v: 1, title: 'A', days: [{ label: 'Ngày 1', items: [{ name: 'x' }] }] }
    const big: PlanShareSnapshot = { v: 1, title: 'B', days: Array.from({ length: 7 }, (_, i) => day(i + 1)) }
    const bigger: PlanShareSnapshot = { v: 1, title: 'B', days: Array.from({ length: 12 }, (_, i) => day(i + 1)) }
    expect(planCardHeight(big)).toBeGreaterThan(planCardHeight(small))
    expect(planCardHeight(bigger)).toBe(planCardHeight(big))
    expect(PLAN_CARD_DAYS).toBe(3)
    expect(PLAN_CARD_STOPS).toBe(4)
    expect(planCardHeight(big)).toBeLessThan(4000)
  })
})
