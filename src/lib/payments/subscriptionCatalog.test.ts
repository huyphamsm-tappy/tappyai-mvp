import { describe, expect, it } from 'vitest'
import { subscriptionCatalog } from './subscriptionCatalog'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT, PAID_DAILY_CEILING } from '@/lib/config/product'
import { PAID_PLAN_IDS, isSubscriptionPlanId } from '@/lib/plans/planConfig'

const env = (v: Record<string, string> = {}) => v as unknown as NodeJS.ProcessEnv

describe('subscriptionCatalog', () => {
  it(`five plans ordered by duration, hidden ceiling of ${PAID_DAILY_CEILING} AI questions a day, no plan badged`, () => {
    const c = subscriptionCatalog({ env: env() })
    // Owner 01/11/2026: new plan catalog (stable sort by duration over SALE_PLAN_IDS)
    expect(c.plans.map((p) => p.id)).toEqual(['pip', 'momo', 'promax1m', 'coco', 'promax3m'])
    expect(c.plans.map((p) => p.durationDays)).toEqual([7, 30, 30, 90, 90])
    for (const p of c.plans) {
      // owner 01/11/2026: 30 -> 1000 (accounts have no visible limit; hidden anti-abuse ceiling)
      expect(PAID_DAILY_CEILING).toBe(1000)
      expect(p.dailyAiQuestions).toBe(PAID_DAILY_CEILING)
      expect(p).not.toHaveProperty('popular')
      // Owner 01/11/2026: new plan catalog - no plan has a badge any more
      expect(p.badge).toBeNull()
    }
  })

  it('sells exactly the 5 sale plans; Milo and Sunny are not in the catalog', () => {
    // Owner 01/11/2026: new plan catalog
    const ids = subscriptionCatalog({ env: env() }).plans.map((p) => p.id)
    expect([...ids].sort()).toEqual(['coco', 'momo', 'pip', 'promax1m', 'promax3m'])
    expect(ids).not.toContain('milo')
    expect(ids).not.toContain('sunny')
    const appIds = subscriptionCatalog({ forApp: true, env: env() }).plans.map((p) => p.id)
    expect(appIds).toEqual(ids)
    // still valid stored plans (rows of people who bought them)
    expect(PAID_PLAN_IDS).toEqual(['pip', 'momo', 'coco', 'promax1m', 'promax3m', 'milo', 'sunny'])
    expect(isSubscriptionPlanId('milo')).toBe(true)
    expect(isSubscriptionPlanId('sunny')).toBe(true)
  })

  it(`Free carries the value the backend enforces (hidden ${FREE_DAILY_LIMIT} a day); guest ${ANON_LIFETIME_LIMIT}; every paid plan ${PAID_DAILY_CEILING} a day`, () => {
    expect(FREE_DAILY_LIMIT).toBe(300)
    expect(ANON_LIFETIME_LIMIT).toBe(10)
    expect(subscriptionCatalog({ env: env() }).free.dailyAiQuestions).toBe(FREE_DAILY_LIMIT)
    for (const p of subscriptionCatalog({ env: env() }).plans) expect(p.dailyAiQuestions).toBe(PAID_DAILY_CEILING)
    expect(subscriptionCatalog({ env: env() }).guest.aiQuestions).toBe(ANON_LIFETIME_LIMIT)
  })

  it('web gets VND prices; no catalog plan gets "about …/month"; no per-day price or hint anywhere; apps get no price', () => {
    const web = subscriptionCatalog({ env: env() })
    // Owner 01/11/2026: new plan catalog
    expect(web.plans.find((p) => p.id === 'momo')).toMatchObject({ priceVnd: 175_000 })
    expect(web.plans.find((p) => p.id === 'promax1m')).toMatchObject({ priceVnd: 225_000 })
    // Owner 01/11/2026: new plan catalog - Sunny (the only showMonthlyApprox plan) is not sold, so no card has it
    expect(web.plans.find((p) => p.id === 'sunny')).toBeUndefined()
    for (const p of web.plans) {
      expect(p).not.toHaveProperty('monthlyApproxVnd')
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
    // Owner 01/11/2026: new plan catalog - pip shows MoMo art (SUBSCRIPTION_IMAGE_MOMO), momo/coco Coco art, promax* Tappy art
    const c = subscriptionCatalog({ env: env({ SUBSCRIPTION_IMAGE_MOMO: 'https://cdn.example/momo.png', SUBSCRIPTION_IMAGE_COCO: 'javascript:alert(1)' }) })
    expect(c.plans[0].id).toBe('pip')
    expect(c.plans[0].character.imageUrl).toBe('https://cdn.example/momo.png')
    expect(c.plans[1].id).toBe('momo')
    expect(c.plans[1].character.imageUrl).toBe('/subscription/coco.webp') // javascript: is refused
    expect(c.plans[2].id).toBe('promax1m')
    expect(c.plans[2].character).toEqual({ color: 'orange', pose: 'welcome', imageUrl: '/subscription/tappy.webp' })
    expect(c.plans.find((p) => p.id === 'coco')?.character).toEqual({ color: 'blue', pose: 'travel', imageUrl: '/subscription/coco.webp' })
    expect(c.plans.find((p) => p.id === 'promax3m')?.character).toEqual({ color: 'orange', pose: 'welcome', imageUrl: '/subscription/tappy.webp' })
  })

  it('contains no internal notes, targets or previous values', () => {
    const s = JSON.stringify(subscriptionCatalog({ env: env() }))
    // priceUsd is the PUBLIC list price ("$1 · 7 ngày"), so only the non-public fields are barred.
    expect(s).not.toMatch(/note|target|previous|migration|grandfather|perDay/i)
  })
})
