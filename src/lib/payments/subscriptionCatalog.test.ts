import { describe, expect, it } from 'vitest'
import { subscriptionCatalog } from './subscriptionCatalog'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT, PAID_DAILY_CEILING } from '@/lib/config/product'

const env = (v: Record<string, string> = {}) => v as unknown as NodeJS.ProcessEnv

describe('subscriptionCatalog', () => {
  it(`five plans ordered by duration, hidden ceiling of ${PAID_DAILY_CEILING} AI questions a day, only Sunny badged`, () => {
    const c = subscriptionCatalog({ env: env() })
    expect(c.plans.map((p) => p.id)).toEqual(['pip', 'momo', 'coco', 'milo', 'sunny'])
    expect(c.plans.map((p) => p.durationDays)).toEqual([7, 30, 90, 180, 365])
    for (const p of c.plans) {
      // owner 01/11/2026: 30 -> 1000 (accounts have no visible limit; hidden anti-abuse ceiling)
      expect(PAID_DAILY_CEILING).toBe(1000)
      expect(p.dailyAiQuestions).toBe(PAID_DAILY_CEILING)
      expect(p).not.toHaveProperty('popular')
      expect(p.badge).toBe(p.id === 'sunny' ? 'popular' : null)
    }
  })

  it(`Free carries the value the backend enforces (hidden ${FREE_DAILY_LIMIT} a day); guest ${ANON_LIFETIME_LIMIT}; every paid plan ${PAID_DAILY_CEILING} a day`, () => {
    expect(FREE_DAILY_LIMIT).toBe(300)
    expect(ANON_LIFETIME_LIMIT).toBe(10)
    expect(subscriptionCatalog({ env: env() }).free.dailyAiQuestions).toBe(FREE_DAILY_LIMIT)
    for (const p of subscriptionCatalog({ env: env() }).plans) expect(p.dailyAiQuestions).toBe(PAID_DAILY_CEILING)
    expect(subscriptionCatalog({ env: env() }).guest.aiQuestions).toBe(ANON_LIFETIME_LIMIT)
  })

  it('web gets VND prices; only Sunny gets "about …/month"; no per-day price or hint anywhere; apps get no price', () => {
    const web = subscriptionCatalog({ env: env() })
    expect(web.plans.find((p) => p.id === 'momo')).toMatchObject({ priceVnd: 179_000 })
    expect(web.plans.find((p) => p.id === 'sunny')?.monthlyApproxVnd).toBe(143_000)
    for (const p of web.plans) {
      if (p.id !== 'sunny') expect(p).not.toHaveProperty('monthlyApproxVnd')
      expect(p).not.toHaveProperty('valueHint')
      expect(p).not.toHaveProperty('pricePerDayVnd')
    }
    const app = subscriptionCatalog({ forApp: true, env: env() })
    for (const p of app.plans) {
      expect(p).not.toHaveProperty('priceVnd')
      expect(p).not.toHaveProperty('monthlyApproxVnd')
    }
  })

  it('character images: the shipped art by default; an https env override wins; anything else is ignored', () => {
    const c = subscriptionCatalog({ env: env({ SUBSCRIPTION_IMAGE_PIP: 'https://cdn.example/pip.png', SUBSCRIPTION_IMAGE_MOMO: 'javascript:alert(1)' }) })
    expect(c.plans[0].character.imageUrl).toBe('https://cdn.example/pip.png')
    expect(c.plans[1].character.imageUrl).toBe('/subscription/momo.webp') // javascript: is refused
    expect(c.plans[2].character).toEqual({ color: 'blue', pose: 'travel', imageUrl: '/subscription/coco.webp' })
  })

  it('contains no internal notes, targets or previous values', () => {
    const s = JSON.stringify(subscriptionCatalog({ env: env() }))
    // priceUsd is the PUBLIC list price ("$1 · 7 ngày"), so only the non-public fields are barred.
    expect(s).not.toMatch(/note|target|previous|migration|grandfather|perDay/i)
  })
})
