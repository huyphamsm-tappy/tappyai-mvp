import { describe, expect, it } from 'vitest'
import { subscriptionCatalog } from './subscriptionCatalog'

const env = (v: Record<string, string> = {}) => v as unknown as NodeJS.ProcessEnv

describe('subscriptionCatalog', () => {
  it('five plans ordered by duration, 30 AI questions a day, only Sunny badged', () => {
    const c = subscriptionCatalog({ env: env() })
    expect(c.plans.map((p) => p.id)).toEqual(['pip', 'momo', 'coco', 'milo', 'sunny'])
    expect(c.plans.map((p) => p.durationDays)).toEqual([7, 30, 90, 180, 365])
    for (const p of c.plans) {
      expect(p.dailyAiQuestions).toBe(30)
      expect(p).not.toHaveProperty('popular')
      expect(p.badge).toBe(p.id === 'sunny' ? 'popular' : null)
    }
  })

  it('Free shows the value the backend enforces (15 a day); guest 5; every paid plan 30 a day', () => {
    expect(subscriptionCatalog({ env: env() }).free.dailyAiQuestions).toBe(15)
    for (const p of subscriptionCatalog({ env: env() }).plans) expect(p.dailyAiQuestions).toBe(30)
    expect(subscriptionCatalog({ env: env() }).guest.aiQuestions).toBe(5)
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
